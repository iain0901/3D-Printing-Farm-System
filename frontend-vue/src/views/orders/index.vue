<template>
  <div class="orders-container">
    <el-tabs v-model="tab">
      <el-tab-pane label="訂單" name="orders">
        <div class="quickbar">
          <el-button v-permissions="['orders:write']" type="primary" icon="el-icon-circle-plus" @click="orderDialogVisible = true">新增訂單</el-button>
        </div>
        <el-table :data="orders" style="width: 100%">
          <el-table-column prop="id" label="編號" width="100" />
          <el-table-column prop="source" label="來源" width="90" />
          <el-table-column label="客戶" min-width="130">
            <template slot-scope="{ row }">
              {{ row.customer }}
              <el-tag v-if="row.customerId" size="mini" type="success">已連結</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="project" label="專案" min-width="120" />
          <el-table-column prop="material" label="材料" width="90" />
          <el-table-column label="顏色" width="150">
            <template slot-scope="{ row }">
              <span v-if="row.filePartCount > 1" class="hint">{{ row.filePartCount }} 個零件・{{ row.color }}</span>
              <span v-else>{{ row.color || 'Any' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="後製/備註" min-width="130">
            <template slot-scope="{ row }">
              <span v-if="row.postProcessing && row.postProcessing.length" class="hint">{{ row.postProcessing.join('、') }}</span>
              <span v-if="row.notes" class="hint" :title="row.notes">・備註：{{ row.notes }}</span>
            </template>
          </el-table-column>
          <el-table-column label="狀態" width="150">
            <template slot-scope="{ row }">
              <el-select v-if="canWrite" v-model="row.status" size="mini" :disabled="statusBusy === row.id" @change="changeStatus(row)">
                <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
              </el-select>
              <el-tag v-else size="mini">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="due" label="到期" width="140" />
          <el-table-column label="金額" width="100">
            <template slot-scope="{ row }">${{ row.value }}</template>
          </el-table-column>
          <el-table-column label="操作" width="140" v-permissions="['orders:write']">
            <template slot-scope="{ row }">
              <el-button size="mini" :loading="genBusy === row.id" @click="generateJobs(row)">生成任務</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!orders.length" class="empty-hint">尚無訂單</div>
      </el-tab-pane>

      <el-tab-pane label="報價需求" name="quotes">
        <el-table :data="quoteRequests" style="width: 100%">
          <el-table-column prop="customer" label="客戶" min-width="120" />
          <el-table-column prop="project" label="專案" min-width="120" />
          <el-table-column prop="material" label="材料" width="90" />
          <el-table-column prop="quantity" label="數量" width="70" />
          <el-table-column label="顏色" width="150">
            <template slot-scope="{ row }">
              <span v-if="row.filePartCount > 1" class="hint">{{ row.filePartCount }} 個零件（多色）</span>
              <span v-else>{{ row.color || 'Any' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="後製/備註" min-width="130">
            <template slot-scope="{ row }">
              <span v-if="row.postProcessing && row.postProcessing.length" class="hint">{{ row.postProcessing.join('、') }}</span>
              <span v-if="row.notes" class="hint" :title="row.notes">・備註：{{ row.notes }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="狀態" width="110" />
          <el-table-column prop="priority" label="優先級" width="90" />
          <el-table-column label="報價金額" width="100">
            <template slot-scope="{ row }">${{ row.quotedValue || 0 }}</template>
          </el-table-column>
          <el-table-column label="操作" width="140" v-permissions="['orders:write']">
            <template slot-scope="{ row }">
              <el-button size="mini" type="primary" :disabled="row.status === 'converted'" :loading="convertBusy === row.id" @click="convert(row)">轉為訂單</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!quoteRequests.length" class="empty-hint">尚無報價需求</div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog title="新增訂單" :visible.sync="orderDialogVisible" width="480px">
      <el-form label-width="90px" size="small">
        <el-form-item label="來源">
          <el-select v-model="orderForm.source" style="width: 100%">
            <el-option v-for="s in ['Manual', 'Shopify', 'Etsy', 'eBay']" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="客戶">
          <el-select
            v-model="orderForm.customerId"
            filterable
            clearable
            placeholder="搜尋現有客戶（選填）"
            style="width: 100%; margin-bottom: 6px"
            @change="onCustomerSelect"
          >
            <el-option v-for="c in customers" :key="c.id" :label="c.company ? `${c.name} / ${c.company}` : c.name" :value="c.id" />
          </el-select>
          <el-input v-model="orderForm.customer" placeholder="客戶顯示名稱（選了上面會自動帶入，也可直接手動輸入未建檔客戶）" />
        </el-form-item>
        <el-form-item label="品項"><el-input v-model="orderForm.itemsText" placeholder="以逗號分隔" /></el-form-item>
        <el-form-item label="到期"><el-input v-model="orderForm.due" /></el-form-item>
        <el-form-item label="金額"><el-input-number v-model="orderForm.value" :min="0" style="width: 100%" controls-position="right" /></el-form-item>
      </el-form>
      <div slot="footer">
        <el-button @click="orderDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitOrder">新增</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { createOrder, updateOrderStatus, generateJobsForOrder, convertQuoteRequest } from '@/api/orders'

  const STATUS_OPTIONS = ['received', 'queued', 'printing', 'on_hold', 'packed', 'shipped', 'completed', 'cancelled']

  export default {
    name: 'Orders',
    data() {
      return {
        tab: 'orders',
        statusOptions: STATUS_OPTIONS,
        statusBusy: '',
        genBusy: '',
        convertBusy: '',
        orderDialogVisible: false,
        creating: false,
        orderForm: { source: 'Manual', customer: '', customerId: '', itemsText: '', due: 'Tomorrow 17:00', value: 0 },
      }
    },
    computed: {
      ...mapGetters({ orders: 'orders/list', quoteRequests: 'orders/quoteRequests', permissions: 'user/permissions', customers: 'customers/list' }),
      canWrite() {
        return this.permissions.includes('*') || this.permissions.includes('orders:write')
      },
    },
    methods: {
      onCustomerSelect(customerId) {
        const customer = this.customers.find((item) => item.id === customerId)
        if (customer) this.orderForm.customer = customer.company ? `${customer.name} / ${customer.company}` : customer.name
      },
      async changeStatus(row) {
        this.statusBusy = row.id
        try {
          const result = await updateOrderStatus(row.id, row.status)
          this.$store.commit('orders/patchOne', result.order || result)
          if (Array.isArray(result.jobs)) result.jobs.forEach((job) => this.$store.commit('queue/patchOne', job))
        } finally {
          this.statusBusy = ''
        }
      },
      async generateJobs(row) {
        this.genBusy = row.id
        try {
          const result = await generateJobsForOrder(row.id, false)
          if (Array.isArray(result.jobs)) result.jobs.forEach((job) => this.$store.commit('queue/patchOne', job))
          this.$baseMessage(`已為 ${row.id} 生成 ${(result.jobs || []).length} 筆任務`, 'success')
        } finally {
          this.genBusy = ''
        }
      },
      async convert(row) {
        this.convertBusy = row.id
        try {
          const result = await convertQuoteRequest(row.id, { createJob: true })
          if (result.quoteRequest) this.$store.commit('orders/patchQuote', result.quoteRequest)
          if (result.order) this.$store.commit('orders/patchOne', result.order)
          this.$baseMessage('已轉為訂單', 'success')
        } finally {
          this.convertBusy = ''
        }
      },
      async submitOrder() {
        if (!this.orderForm.customer.trim() || !this.orderForm.itemsText.trim()) {
          this.$baseMessage('請輸入客戶與品項', 'warning')
          return
        }
        this.creating = true
        try {
          const items = this.orderForm.itemsText.split(',').map((s) => s.trim()).filter(Boolean)
          const order = await createOrder({
            source: this.orderForm.source,
            customer: this.orderForm.customer,
            customerId: this.orderForm.customerId,
            items,
            due: this.orderForm.due,
            value: this.orderForm.value,
          })
          this.$store.commit('orders/patchOne', order)
          this.$baseMessage('訂單已新增', 'success')
          this.orderDialogVisible = false
          this.orderForm = { source: 'Manual', customer: '', customerId: '', itemsText: '', due: 'Tomorrow 17:00', value: 0 }
        } finally {
          this.creating = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .orders-container {
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

  .hint {
    color: $base-color-gray;
    font-size: 12px;
  }
</style>
