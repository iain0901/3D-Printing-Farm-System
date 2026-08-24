<template>
  <div class="slicer-container">
    <el-row :gutter="16">
      <el-col :xs="24" :md="10">
        <el-card shadow="never">
          <template #header><div>切片設定</div></template>
          <el-form label-width="90px" size="small">
            <el-form-item label="模型檔">
              <el-select v-model="settings.fileId" style="width: 100%">
                <el-option v-for="f in files" :key="f.id" :label="f.name" :value="f.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="打印機">
              <el-select v-model="settings.printerId" style="width: 100%">
                <el-option v-for="p in printers" :key="p.id" :label="`${p.model} · ${p.name}`" :value="p.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="材料">
              <el-select v-model="settings.material" style="width: 100%">
                <el-option v-for="m in materials" :key="m" :label="m" :value="m" />
              </el-select>
            </el-form-item>
            <el-form-item label="層高">
              <el-select v-model="settings.layerHeight" style="width: 100%">
                <el-option v-for="l in layerHeights" :key="l" :label="l" :value="l" />
              </el-select>
            </el-form-item>
            <el-form-item label="填充率">
              <el-slider v-model="settings.infill" :max="80" show-input />
            </el-form-item>
            <el-form-item label="支撐">
              <el-switch v-model="settings.supports" />
            </el-form-item>
            <el-form-item>
              <el-button v-permissions="['files:write']" type="primary" :loading="running" @click="run" style="width: 100%">{{ running ? '切片中…' : '開始切片' }}</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="14">
        <el-card shadow="never">
          <template #header><div>結果</div></template>
          <p v-if="resultText" class="result-text">{{ resultText }}</p>
          <p v-else class="muted">選擇檔案與設定後，建立後端切片工作。</p>
          <h4>近期切片工作</h4>
          <ul class="event-feed">
            <li v-for="job in slicerJobs.slice(0, 8)" :key="job.id">
              <span :class="'status-dot ' + (job.status === 'complete' ? 'complete' : job.status === 'failed' ? 'failed' : 'queued')" />
              <span>{{ job.sourceFile }} · {{ job.engine }}</span>
              <em>{{ job.status }}{{ job.outputSize ? ' · ' + job.outputSize : '' }}</em>
            </li>
            <li v-if="!slicerJobs.length" class="empty-hint">尚無切片工作</li>
          </ul>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { fetchSlicerJobs, runSlicerJob } from '@/api/slicer'

  export default {
    name: 'Slicer',
    data() {
      return {
        materials: ['PLA', 'PETG', 'ASA', 'TPU', 'Resin'],
        layerHeights: ['0.08', '0.12', '0.16', '0.20', '0.28'],
        settings: { fileId: '', printerId: '', material: 'PLA', layerHeight: '0.20', infill: 18, supports: true },
        running: false,
        resultText: '',
        slicerJobs: [],
      }
    },
    computed: {
      ...mapGetters({ files: 'files/list', printers: 'printers/list' }),
    },
    created() {
      if (this.files.length) this.settings.fileId = (this.files.find((f) => !f.sliced) || this.files[0]).id
      if (this.printers.length) this.settings.printerId = this.printers[0].id
      this.loadJobs()
    },
    methods: {
      async loadJobs() {
        this.slicerJobs = await fetchSlicerJobs()
      },
      async run() {
        if (!this.settings.fileId || !this.settings.printerId) {
          this.$baseMessage('請先選擇模型檔與打印機', 'warning')
          return
        }
        this.running = true
        try {
          const result = await runSlicerJob(this.settings)
          this.slicerJobs = result.slicerJobs
          this.$store.commit('files/patchOne', result.file)
          const file = this.files.find((f) => f.id === this.settings.fileId)
          if (result.job.status === 'complete') {
            this.resultText = `${result.job.outputName || (file ? file.name : '')} · ${this.settings.material}, ${this.settings.layerHeight}mm, ${this.settings.infill}% infill · ${result.job.engine} engine`
            this.$baseMessage('切片完成', 'success')
          } else {
            this.resultText = `切片失敗：${result.job.error || '未知錯誤'}`
            this.$baseMessage('切片失敗', 'warning')
          }
        } finally {
          this.running = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .slicer-container {
    padding: 20px;
  }

  .result-text {
    font-weight: 600;
  }

  .muted {
    color: $base-color-gray;
  }

  .event-feed {
    list-style: none;
    margin: 0;
    padding: 0;

    li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px dashed $base-border-color;

      &:last-child {
        border-bottom: none;
      }

      em {
        margin-left: auto;
        font-style: normal;
        font-size: 12px;
        color: $base-color-gray;
      }
    }
  }

  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: $base-color-gray;
    flex: none;

    &.complete {
      background: $base-color-green;
    }

    &.failed {
      background: $base-color-red;
    }

    &.queued {
      background: $base-color-orange;
    }
  }

  .empty-hint {
    color: $base-color-gray;
  }
</style>
