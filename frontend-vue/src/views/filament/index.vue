<template>
  <div class="filament-container">
    <el-tabs v-model="tab">
      <el-tab-pane label="線材庫存" name="spools">
        <div class="quickbar">
          <el-button v-permissions="['inventory:write']" type="primary" icon="CirclePlus" @click="spoolDialogVisible = true">新增線材</el-button>
        </div>
        <el-table :data="spools" style="width: 100%">
          <el-table-column prop="material" label="材料" width="100" />
          <el-table-column prop="brand" label="品牌" width="120" />
          <el-table-column prop="location" label="位置" width="140" />
          <el-table-column label="剩餘">
            <template #default="{ row }">
              <el-progress :percentage="Math.round((row.remaining / row.weight) * 100)" :stroke-width="8" />
              <small>{{ row.remaining }}g / {{ row.weight }}g</small>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="140" v-permissions="['inventory:write']">
            <template #default="{ row }">
              <el-button size="small" :loading="usageBusy === row.id" @click="logUsage(row)">記錄用量 20g</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!spools.length" class="empty-hint">尚無線材庫存資料</div>
      </el-tab-pane>

      <el-tab-pane label="採購申請" name="purchases">
        <div class="quickbar">
          <el-button v-permissions="['inventory:write']" type="primary" icon="CirclePlus" @click="purchaseDialogVisible = true">新增採購申請</el-button>
        </div>
        <el-table :data="purchaseRequests" style="width: 100%">
          <el-table-column prop="material" label="材料" width="100" />
          <el-table-column prop="supplier" label="供應商" min-width="140" />
          <el-table-column prop="quantity" label="數量" width="80" />
          <el-table-column prop="status" label="狀態" width="100" />
          <el-table-column prop="due" label="到期" width="120" />
          <el-table-column label="操作" width="120" v-permissions="['inventory:write']">
            <template #default="{ row }">
              <el-button size="small" :disabled="row.status === 'received'" :loading="receiveBusy === row.id" @click="receive(row)">已收貨</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!purchaseRequests.length" class="empty-hint">尚無採購申請</div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog title="新增線材" v-model="spoolDialogVisible" width="420px">
      <el-form label-width="80px" size="small">
        <el-form-item label="材料"><el-input v-model="spoolForm.material" /></el-form-item>
        <el-form-item label="品牌"><el-input v-model="spoolForm.brand" /></el-form-item>
        <el-form-item label="位置"><el-input v-model="spoolForm.location" /></el-form-item>
        <el-form-item label="總重 g"><el-input-number v-model="spoolForm.weight" :min="1" style="width: 100%" controls-position="right" /></el-form-item>
      </el-form>
      <template #footer><div>
        <el-button @click="spoolDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingSpool" @click="submitSpool">新增</el-button>
      </div></template>
    </el-dialog>

    <el-dialog title="新增採購申請" v-model="purchaseDialogVisible" width="420px">
      <el-form label-width="80px" size="small">
        <el-form-item label="材料"><el-input v-model="purchaseForm.material" /></el-form-item>
        <el-form-item label="供應商"><el-input v-model="purchaseForm.supplier" /></el-form-item>
        <el-form-item label="數量"><el-input-number v-model="purchaseForm.quantity" :min="1" style="width: 100%" controls-position="right" /></el-form-item>
      </el-form>
      <template #footer><div>
        <el-button @click="purchaseDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingPurchase" @click="submitPurchase">新增</el-button>
      </div></template>
    </el-dialog>
  </div>
</template>

<script>
  import { fetchState } from '@/api/realtime'
  import { createSpool, logSpoolUsage, createPurchaseRequest, receivePurchaseRequest } from '@/api/filament'

  export default {
    name: 'Filament',
    data() {
      return {
        tab: 'spools',
        spools: [],
        purchaseRequests: [],
        usageBusy: '',
        receiveBusy: '',
        spoolDialogVisible: false,
        savingSpool: false,
        spoolForm: { material: 'PLA', brand: 'Generic', location: 'Rack New', weight: 1000 },
        purchaseDialogVisible: false,
        savingPurchase: false,
        purchaseForm: { material: 'PLA', supplier: 'Preferred supplier', quantity: 1 },
      }
    },
    created() {
      this.load()
    },
    methods: {
      async load() {
        const data = await fetchState()
        this.spools = data.spools || []
        this.purchaseRequests = data.purchaseRequests || []
      },
      async logUsage(row) {
        this.usageBusy = row.id
        try {
          const spool = await logSpoolUsage(row.id, 20)
          const index = this.spools.findIndex((s) => s.id === spool.id)
          if (index !== -1) this.spools.splice(index, 1, spool)
          this.$baseMessage('已記錄用量', 'success')
        } finally {
          this.usageBusy = ''
        }
      },
      async submitSpool() {
        this.savingSpool = true
        try {
          const spool = await createSpool(this.spoolForm)
          this.spools.push(spool)
          this.$baseMessage('線材已新增', 'success')
          this.spoolDialogVisible = false
        } finally {
          this.savingSpool = false
        }
      },
      async receive(row) {
        this.receiveBusy = row.id
        try {
          const result = await receivePurchaseRequest(row.id)
          const index = this.purchaseRequests.findIndex((r) => r.id === row.id)
          if (index !== -1) this.purchaseRequests.splice(index, 1, result.request)
          if (Array.isArray(result.spools)) this.spools.push(...result.spools)
          this.$baseMessage('已標記收貨並入庫', 'success')
        } finally {
          this.receiveBusy = ''
        }
      },
      async submitPurchase() {
        this.savingPurchase = true
        try {
          const created = await createPurchaseRequest(this.purchaseForm)
          this.purchaseRequests.push(created)
          this.$baseMessage('採購申請已新增', 'success')
          this.purchaseDialogVisible = false
        } finally {
          this.savingPurchase = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .filament-container {
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
