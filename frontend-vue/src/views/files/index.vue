<template>
  <div class="files-container">
    <div class="quickbar">
      <el-upload
        v-permissions="['files:write']"
        action=""
        :show-file-list="false"
        :http-request="handleUpload"
        accept=".stl,.3mf,.obj,.gcode"
      >
        <el-button type="primary" icon="Upload" :loading="uploading">上傳模型檔</el-button>
      </el-upload>
      <el-select v-model="uploadMaterial" size="small" style="width: 140px">
        <el-option v-for="m in materials" :key="m" :label="m" :value="m" />
      </el-select>
      <el-select v-model="uploadFolder" size="small" style="width: 140px">
        <el-option v-for="f in folderNames" :key="f" :label="f" :value="f" />
      </el-select>
      <el-button v-permissions="['files:write']" icon="FolderAdd" @click="folderDialogVisible = true">新增資料夾</el-button>
    </div>

    <el-table :data="files" style="width: 100%">
      <el-table-column prop="name" label="檔名" min-width="200" />
      <el-table-column prop="type" label="類型" width="90" />
      <el-table-column prop="folder" label="資料夾" width="120" />
      <el-table-column prop="material" label="材料" width="110" />
      <el-table-column prop="size" label="大小" width="100" />
      <el-table-column label="狀態" width="110">
        <template #default="{ row }">
          <el-tag size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220">
        <template #default="{ row }">
          <el-button size="small" :loading="previewBusy === row.id" @click="handlePreview(row)">預覽</el-button>
          <el-button size="small" @click="handleDownload(row)">下載</el-button>
          <el-button v-permissions="['files:write']" size="small" type="danger" @click="handleDelete(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div v-if="!files.length" class="empty-hint">尚無檔案，上傳一個 STL/3MF/OBJ/G-code 開始</div>

    <el-dialog v-model="previewVisible" title="檔案預覽 / DFM 檢查" width="480px">
      <div v-if="previewData">
        <model-viewer v-if="previewArrayBuffer" :array-buffer="previewArrayBuffer" :filename="previewData.name" :height="260" />
        <p>
          <b>{{ previewData.name }}</b>
          （{{ previewData.type }} · {{ previewData.material }}）
        </p>
        <p>尺寸：{{ previewData.summary.dimensions.join(' × ') }} mm</p>
        <p>預估重量：{{ previewData.summary.estimateGrams }}g · 預估工時：{{ previewData.summary.printTime }}</p>
        <p>建構板佔用率：{{ previewData.buildPlate.occupancyPercent }}%（{{ previewData.buildPlate.fit }}）</p>
        <p v-if="previewData.compatiblePrinters.length">相容打印機：{{ previewData.compatiblePrinters.map((p) => p.name).join('、') }}</p>
        <el-alert
          v-for="(warning, index) in previewData.warnings"
          :key="index"
          :title="warning"
          type="warning"
          show-icon
          :closable="false"
          style="margin-top: 8px"
        />
      </div>
    </el-dialog>

    <el-dialog v-model="folderDialogVisible" title="新增資料夾" width="380px">
      <el-form label-width="80px" size="small">
        <el-form-item label="名稱"><el-input v-model="folderForm.name" /></el-form-item>
        <el-form-item label="用途">
          <el-select v-model="folderForm.purpose" style="width: 100%">
            <el-option label="收件匣" value="inbox" />
            <el-option label="生產" value="production" />
            <el-option label="審核" value="review" />
            <el-option label="封存" value="archive" />
            <el-option label="樣品" value="sample" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <div>
          <el-button @click="folderDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="creatingFolder" @click="submitFolder">新增</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { uploadModelFile, createFileFolder, downloadFile, deleteFile, fetchFilePreview, fetchFileRaw } from '@/api/files'
  import ModelViewer from '@/components/ModelViewer'

  export default {
    name: 'Files',
    components: { ModelViewer },
    data() {
      return {
        uploading: false,
        uploadMaterial: 'PLA',
        uploadFolder: 'Uploads',
        materials: ['PLA', 'PETG', 'ASA', 'TPU', 'Resin'],
        folderDialogVisible: false,
        creatingFolder: false,
        folderForm: { name: '', purpose: 'inbox' },
        previewVisible: false,
        previewBusy: '',
        previewData: null,
        previewArrayBuffer: null,
      }
    },
    computed: {
      ...mapGetters({ files: 'files/list', folders: 'files/folders' }),
      folderNames() {
        const names = this.folders.map((f) => f.name)
        return names.length ? names : ['Uploads']
      },
    },
    methods: {
      async handleUpload({ file }) {
        this.uploading = true
        try {
          const uploaded = await uploadModelFile(file, this.uploadMaterial, this.uploadFolder)
          this.$store.commit('files/patchOne', uploaded)
          this.$baseMessage(`${uploaded.name} 已上傳並解析`, 'success')
        } finally {
          this.uploading = false
        }
      },
      async submitFolder() {
        if (!this.folderForm.name.trim()) {
          this.$baseMessage('請輸入資料夾名稱', 'warning')
          return
        }
        this.creatingFolder = true
        try {
          const result = await createFileFolder({ name: this.folderForm.name, purpose: this.folderForm.purpose })
          this.$store.commit('files/setFolders', result.folders)
          this.$baseMessage('資料夾已新增', 'success')
          this.folderDialogVisible = false
          this.folderForm = { name: '', purpose: 'inbox' }
        } finally {
          this.creatingFolder = false
        }
      },
      async handlePreview(file) {
        this.previewBusy = file.id
        this.previewArrayBuffer = null
        try {
          this.previewData = await fetchFilePreview(file.id)
          this.previewVisible = true
          fetchFileRaw(file.id)
            .then((buffer) => {
              this.previewArrayBuffer = buffer
            })
            .catch(() => {})
        } finally {
          this.previewBusy = ''
        }
      },
      async handleDownload(file) {
        try {
          await downloadFile(file)
        } catch {
          this.$baseMessage('下載失敗', 'error')
        }
      },
      async handleDelete(file) {
        this.$baseConfirm(`確定要刪除「${file.name}」嗎？`, null, async () => {
          await deleteFile(file.id)
          this.$store.commit('files/removeOne', file.id)
          this.$baseMessage('已刪除', 'success')
        })
      },
    },
  }
</script>

<style lang="scss" scoped>
  .files-container {
    padding: 20px;
  }

  .quickbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  .empty-hint {
    color: $base-color-gray;
    padding: 20px 0;
    text-align: center;
  }
</style>
