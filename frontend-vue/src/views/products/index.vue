<template>
  <div class="products-container">
    <el-tabs v-model="tab">
      <el-tab-pane label="零件" name="parts">
        <div class="quickbar">
          <el-button v-permissions="['catalog:write']" type="primary" icon="CirclePlus" @click="partDialogVisible = true">
            新增零件
          </el-button>
        </div>
        <el-table :data="parts" style="width: 100%">
          <el-table-column prop="name" label="名稱" min-width="160" />
          <el-table-column prop="material" label="材料" width="110" />
          <el-table-column prop="process" label="製程" min-width="160" />
          <el-table-column prop="plates" label="片數" width="80" />
          <el-table-column label="狀態" width="110">
            <template #default="{ row }">
              <el-tag size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!parts.length" class="empty-hint">尚無零件</div>
      </el-tab-pane>

      <el-tab-pane label="SKU" name="skus">
        <div class="quickbar">
          <el-button
            v-permissions="['catalog:write']"
            type="primary"
            icon="CirclePlus"
            :disabled="!parts.length"
            @click="skuDialogVisible = true"
          >
            新增 SKU
          </el-button>
        </div>
        <el-table :data="skus" style="width: 100%">
          <el-table-column prop="sku" label="編號" width="140" />
          <el-table-column prop="title" label="標題" min-width="160" />
          <el-table-column label="零件">
            <template #default="{ row }">{{ (row.parts || []).join('、') }}</template>
          </el-table-column>
          <el-table-column label="價格" width="90">
            <template #default="{ row }">${{ row.price }}</template>
          </el-table-column>
          <el-table-column prop="stock" label="庫存" width="80" />
        </el-table>
        <div v-if="!skus.length" class="empty-hint">尚無 SKU</div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="partDialogVisible" title="新增零件" width="440px">
      <el-form label-width="90px" size="small">
        <el-form-item label="名稱"><el-input v-model="partForm.name" /></el-form-item>
        <el-form-item label="來源檔案">
          <el-select v-model="partForm.fileId" style="width: 100%">
            <el-option v-for="f in files" :key="f.id" :label="f.name" :value="f.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="材料"><el-input v-model="partForm.material" /></el-form-item>
      </el-form>
      <template #footer>
        <div>
          <el-button @click="partDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingPart" @click="submitPart">新增</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="skuDialogVisible" title="新增 SKU" width="440px">
      <el-form label-width="90px" size="small">
        <el-form-item label="編號"><el-input v-model="skuForm.sku" /></el-form-item>
        <el-form-item label="標題"><el-input v-model="skuForm.title" /></el-form-item>
        <el-form-item label="零件">
          <el-select v-model="skuForm.parts" multiple style="width: 100%">
            <el-option v-for="p in parts" :key="p.id" :label="p.name" :value="p.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="價格">
          <el-input-number v-model="skuForm.price" :min="0" style="width: 100%" controls-position="right" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div>
          <el-button @click="skuDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingSku" @click="submitSku">新增</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { fetchState } from '@/api/realtime'
  import { createPart, createSku } from '@/api/products'

  export default {
    name: 'Products',
    data() {
      return {
        tab: 'parts',
        parts: [],
        skus: [],
        partDialogVisible: false,
        savingPart: false,
        partForm: { name: '', fileId: '', material: 'PLA' },
        skuDialogVisible: false,
        savingSku: false,
        skuForm: { sku: '', title: '', parts: [], price: 0 },
      }
    },
    computed: {
      ...mapGetters({ files: 'files/list' }),
    },
    created() {
      this.load()
      if (this.files.length) this.partForm.fileId = this.files[0].id
    },
    methods: {
      async load() {
        const data = await fetchState()
        this.parts = data.parts || []
        this.skus = data.skus || []
      },
      async submitPart() {
        if (!this.partForm.name.trim() || !this.partForm.fileId) {
          this.$baseMessage('請輸入名稱並選擇來源檔案', 'warning')
          return
        }
        this.savingPart = true
        try {
          const part = await createPart(this.partForm)
          this.parts.push(part)
          this.$baseMessage('零件已新增', 'success')
          this.partDialogVisible = false
        } finally {
          this.savingPart = false
        }
      },
      async submitSku() {
        if (!this.skuForm.sku.trim() || !this.skuForm.title.trim() || !this.skuForm.parts.length) {
          this.$baseMessage('請填寫編號、標題並選擇零件', 'warning')
          return
        }
        this.savingSku = true
        try {
          const sku = await createSku(this.skuForm)
          this.skus.push(sku)
          this.$baseMessage('SKU 已新增', 'success')
          this.skuDialogVisible = false
        } finally {
          this.savingSku = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .products-container {
    padding: 20px;
  }

  .quickbar {
    margin-bottom: 12px;
  }

  .empty-hint {
    color: $base-color-gray;
    padding: 20px 0;
    text-align: center;
  }
</style>
