<template>
  <div class="orders-container">
    <el-tabs v-model="tab">
      <el-tab-pane label="訂單" name="orders">
        <div class="quickbar">
          <el-button v-permissions="['orders:write']" type="primary" icon="CirclePlus" @click="orderDialogVisible = true">
            新增訂單
          </el-button>
        </div>
        <el-table :data="orders" style="width: 100%">
          <el-table-column prop="id" label="編號" width="100" />
          <el-table-column prop="source" label="來源" width="90" />
          <el-table-column label="客戶" min-width="130">
            <template #default="{ row }">
              {{ row.customer }}
              <el-tag v-if="row.customerId" size="small" type="success">已連結</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="project" label="專案" min-width="120" />
          <el-table-column prop="material" label="材料" width="90" />
          <el-table-column label="顏色" width="150">
            <template #default="{ row }">
              <span v-if="row.filePartCount > 1" class="hint">{{ row.filePartCount }} 個零件・{{ row.color }}</span>
              <span v-else>{{ row.color || 'Any' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="後製/備註" min-width="130">
            <template #default="{ row }">
              <span v-if="row.postProcessing && row.postProcessing.length" class="hint">{{ row.postProcessing.join('、') }}</span>
              <span v-if="row.notes" class="hint" :title="row.notes">・備註：{{ row.notes }}</span>
            </template>
          </el-table-column>
          <el-table-column label="狀態" width="150">
            <template #default="{ row }">
              <el-select v-if="canWrite" v-model="row.status" size="small" :disabled="statusBusy === row.id" @change="changeStatus(row)">
                <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
              </el-select>
              <el-tag v-else size="small">{{ row.status }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="due" label="到期" width="140" />
          <el-table-column label="金額" width="100">
            <template #default="{ row }">${{ row.value }}</template>
          </el-table-column>
          <el-table-column v-permissions="['orders:write']" label="操作" width="140">
            <template #default="{ row }">
              <el-button size="small" :loading="genBusy === row.id" @click="generateJobs(row)">生成任務</el-button>
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
            <template #default="{ row }">
              <span v-if="row.filePartCount > 1" class="hint">{{ row.filePartCount }} 個零件（多色）</span>
              <span v-else>{{ row.color || 'Any' }}</span>
            </template>
          </el-table-column>
          <el-table-column label="後製/備註" min-width="130">
            <template #default="{ row }">
              <span v-if="row.postProcessing && row.postProcessing.length" class="hint">{{ row.postProcessing.join('、') }}</span>
              <span v-if="row.notes" class="hint" :title="row.notes">・備註：{{ row.notes }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="狀態" width="110" />
          <el-table-column prop="priority" label="優先級" width="90" />
          <el-table-column label="報價金額" width="100">
            <template #default="{ row }">${{ row.quotedValue || 0 }}</template>
          </el-table-column>
          <el-table-column v-permissions="['orders:write']" label="操作" width="220">
            <template #default="{ row }">
              <el-button size="small" @click="openQuoteThread(row)">對話／確認</el-button>
              <el-button
                size="small"
                type="primary"
                :disabled="row.status === 'converted'"
                :loading="convertBusy === row.id"
                @click="convert(row)"
              >
                轉訂單
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!quoteRequests.length" class="empty-hint">尚無報價需求</div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="threadDialogVisible" title="報價對話與生產確認" width="680px">
      <template v-if="threadQuote">
        <div class="thread-box">
          <div v-for="msg in threadQuote.messages || []" :key="msg.id" class="thread-message" :class="'by-' + msg.author">
            <b>{{ msg.authorName || msg.author }}</b>
            ：{{ msg.body }}
            <div v-if="(msg.attachments || []).length" class="thread-attachments">
              <span v-for="att in msg.attachments" :key="att.index" class="hint">
                🖼 {{ att.name }}（{{ Math.ceil(att.size / 1024) }}KB）
              </span>
            </div>
          </div>
        </div>
        <div class="thread-reply">
          <el-input v-model="threadReplyBody" type="textarea" :rows="2" placeholder="回覆客戶…" />
          <div class="thread-reply-actions">
            <el-upload
              :auto-upload="false"
              :show-file-list="false"
              accept="image/png,image/jpeg,image/webp,image/gif"
              :on-change="onThreadFile"
            >
              <el-button size="small" icon="Paperclip">
                {{ (threadFiles || []).length ? `已選 ${threadFiles.length} 張圖` : '附圖片' }}
              </el-button>
            </el-upload>
            <el-button size="small" type="primary" :loading="threadSending" @click="sendThreadReply">送出回覆</el-button>
          </div>
        </div>

        <el-divider content-position="left">生產細節確認清單</el-divider>
        <div v-for="item in threadQuote.confirmations || []" :key="item.id" class="confirm-row">
          <el-tag size="small" :type="item.status === 'confirmed' ? 'success' : item.status === 'issue' ? 'warning' : 'info'">
            {{ item.status === 'confirmed' ? '已確認' : item.status === 'issue' ? '有問題' : '待確認' }}
          </el-tag>
          <b>{{ item.label }}</b>
          <span v-if="item.value">：{{ item.value }}</span>
          <span v-if="item.decidedNote" class="hint">｜客戶回覆：{{ item.decidedNote }}</span>
        </div>
        <div class="confirm-create">
          <el-select
            v-model="confirmPreset"
            size="small"
            placeholder="快速加入確認項目"
            style="width: 200px"
            @change="addConfirmFromPreset"
          >
            <el-option v-for="preset in CONFIRM_PRESETS" :key="preset.label" :label="preset.label" :value="preset.label" />
          </el-select>
          <div v-for="(row, index) in confirmDrafts" :key="index" class="confirm-draft-row">
            <el-input v-model="row.label" size="small" placeholder="項目" style="width: 160px" />
            <el-input v-model="row.value" size="small" placeholder="我方建議值／說明" style="flex: 1" />
            <el-button size="small" text type="danger" @click="confirmDrafts.splice(index, 1)">移除</el-button>
          </div>
          <el-button size="small" type="primary" :disabled="!confirmDrafts.length" :loading="confirmSaving" @click="saveConfirmations">
            送出確認請求（客戶會收到 LINE/Email 提醒）
          </el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="orderDialogVisible" title="新增訂單" width="480px">
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
        <el-form-item label="金額">
          <el-input-number v-model="orderForm.value" :min="0" style="width: 100%" controls-position="right" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div>
          <el-button @click="orderDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="creating" @click="submitOrder">新增</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import {
    createOrder,
    updateOrderStatus,
    generateJobsForOrder,
    convertQuoteRequest,
    replyQuoteMessage,
    createQuoteConfirmations,
  } from '@/api/orders'

  const STATUS_OPTIONS = ['received', 'queued', 'printing', 'on_hold', 'packed', 'shipped', 'completed', 'cancelled']
  const CONFIRM_PRESETS = [
    { label: '材料', value: '' },
    { label: '顏色', value: '' },
    { label: '尺寸／關鍵尺寸', value: '' },
    { label: '擺放方向', value: '' },
    { label: '支撐與表面', value: '' },
    { label: '交期', value: '' },
    { label: '後處理', value: '' },
    { label: '包裝方式', value: '' },
  ]

  export default {
    name: 'Orders',
    data() {
      return {
        tab: 'orders',
        statusOptions: STATUS_OPTIONS,
        threadDialogVisible: false,
        threadQuote: null,
        threadReplyBody: '',
        threadFiles: [],
        threadSending: false,
        confirmPreset: '',
        confirmDrafts: [],
        confirmSaving: false,
        statusBusy: '',
        genBusy: '',
        convertBusy: '',
        orderDialogVisible: false,
        creating: false,
        orderForm: { source: 'Manual', customer: '', customerId: '', itemsText: '', due: 'Tomorrow 17:00', value: 0 },
      }
    },
    computed: {
      ...mapGetters({
        orders: 'orders/list',
        quoteRequests: 'orders/quoteRequests',
        permissions: 'user/permissions',
        customers: 'customers/list',
      }),
      canWrite() {
        return this.permissions.includes('*') || this.permissions.includes('orders:write')
      },
    },
    methods: {
      openQuoteThread(row) {
        this.threadQuote = row
        this.threadReplyBody = ''
        this.threadFiles = []
        this.confirmDrafts = []
        this.confirmPreset = ''
        this.threadDialogVisible = true
      },
      onThreadFile(file) {
        const raw = file.raw || file
        if (!/^image\/(png|jpe?g|webp|gif)$/i.test(raw.type || '') && !/\.(png|jpe?g|webp|gif)$/i.test(raw.name || '')) {
          this.$baseMessage('只支援 PNG / JPG / WEBP / GIF 圖片。', 'warning')
          return
        }
        if (raw.size > 5 * 1024 * 1024) {
          this.$baseMessage('圖片上限 5MB。', 'warning')
          return
        }
        if ((this.threadFiles || []).length >= 3) {
          this.$baseMessage('每則訊息最多 3 張圖片。', 'warning')
          return
        }
        this.threadFiles = [...(this.threadFiles || []), raw]
      },
      async sendThreadReply() {
        const body = (this.threadReplyBody || '').trim()
        const files = this.threadFiles || []
        if (!body && !files.length) return
        this.threadSending = true
        try {
          const result = await replyQuoteMessage(this.threadQuote.id, body, files)
          this.threadQuote = result.quoteRequest
          this.$store.commit('orders/patchQuote', result.quoteRequest)
          this.threadReplyBody = ''
          this.threadFiles = []
          this.$baseMessage('回覆已送出，客戶會收到 LINE／Email 通知。', 'success')
        } finally {
          this.threadSending = false
        }
      },
      addConfirmFromPreset(label) {
        const preset = CONFIRM_PRESETS.find((item) => item.label === label)
        if (!preset) return
        if (this.confirmDrafts.some((row) => row.label === label)) {
          this.confirmPreset = ''
          return
        }
        this.confirmDrafts.push({ label: preset.label, value: '', note: '' })
        this.confirmPreset = ''
      },
      async saveConfirmations() {
        const items = this.confirmDrafts.filter((row) => row.label.trim())
        if (!items.length) return
        this.confirmSaving = true
        try {
          const result = await createQuoteConfirmations(this.threadQuote.id, items)
          this.threadQuote = result.quoteRequest
          this.$store.commit('orders/patchQuote', result.quoteRequest)
          this.confirmDrafts = []
          this.$baseMessage('確認請求已送出，客戶會在入口看到待確認清單。', 'success')
        } catch (error) {
          this.$baseMessage(error?.response?.data?.error || '送出失敗，請稍後再試。', 'error')
        } finally {
          this.confirmSaving = false
        }
      },
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
          const items = this.orderForm.itemsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
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
  .thread-box {
    max-height: 260px;
    overflow: auto;
    border: 1px solid #e5e9f2;
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 12px;
  }
  .thread-message {
    font-size: 13px;
    padding: 4px 0;
    border-bottom: 1px dashed #f0f2f7;
    &.by-system {
      color: #8992a3;
    }
    &.by-customer b {
      color: #3563e9;
    }
    &.by-operator b {
      color: #1c7c44;
    }
  }
  .thread-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
  }
  .thread-reply {
    display: grid;
    gap: 8px;
  }
  .thread-reply-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    align-items: center;
  }
  .confirm-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    padding: 4px 0;
  }
  .confirm-create {
    display: grid;
    gap: 8px;
    margin-top: 10px;
  }
  .confirm-draft-row {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .hint {
    color: #8992a3;
    font-size: 12px;
  }
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
