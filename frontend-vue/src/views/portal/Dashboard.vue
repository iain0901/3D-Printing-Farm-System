<template>
  <div class="portal-dashboard">
    <div class="welcome-row">
      <h2>歡迎，{{ customer && customer.name }}</h2>
      <div class="points-badge">
        會員點數：
        <b>{{ (customer && customer.loyaltyPoints) || 0 }}</b>
        點
      </div>
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane label="3D 列印案件" name="cases">
        <el-card shadow="never" class="portal-card">
          <div v-for="caseItem in cases" :key="caseItem.id" class="quote-item">
            <div class="quote-head">
              <b>{{ caseItem.project }}</b>
              <el-tag size="small">{{ caseItem.status }}</el-tag>
            </div>
            <p class="quote-meta">案件編號：{{ caseItem.caseNo }} · {{ caseItem.parts.length }} 個零件</p>
            <p v-if="caseItem.quote" class="quote-meta">報價總額：NT$ {{ caseItem.quote.total }}</p>
            <p v-if="caseItem.delivery && caseItem.delivery.trackingNumber" class="quote-meta">
              物流追蹤：{{ caseItem.delivery.trackingNumber }}
            </p>
            <div v-if="caseItem.status === 'formal_quote_sent'" class="quote-actions">
              <el-button size="small" type="primary" @click="decideUnifiedCase(caseItem, 'accepted')">接受報價</el-button>
              <el-button size="small" @click="decideUnifiedCase(caseItem, 'revision')">要求修改</el-button>
              <el-button size="small" @click="contactSpecialist">取消請聯絡專員</el-button>
            </div>
            <p class="hint">聯絡與補件請在原 LINE 對話中進行。</p>
          </div>
          <div v-if="!cases.length" class="empty-hint">尚無 3D 列印案件</div>
        </el-card>
      </el-tab-pane>
      <el-tab-pane label="報價需求" name="quotes">
        <el-card shadow="never" class="portal-card">
          <div v-for="quote in quotes" :key="quote.id" class="quote-item">
            <div class="quote-head">
              <b>{{ quote.project }}</b>
              <el-tag size="small">{{ quote.status }}</el-tag>
            </div>
            <p class="quote-meta">材料：{{ quote.material }} · 數量：{{ quote.quantity }} · 報價：${{ quote.quotedValue || 0 }}</p>
            <p v-if="quote.filePartCount > 1" class="quote-meta">此檔案偵測到 {{ quote.filePartCount }} 個獨立零件</p>
            <div class="quote-actions">
              <el-button v-if="quote.fileId" size="small" :loading="previewBusy === quote.id" @click="previewQuoteFile(quote)">
                預覽檔案
              </el-button>
              <template v-if="quote.status === 'quoted'">
                <el-button size="small" type="primary" @click="decide(quote, 'accepted')">接受</el-button>
                <el-button size="small" @click="decide(quote, 'revision')">要求修改</el-button>
                <el-button size="small" @click="contactSpecialist">取消請聯絡專員</el-button>
              </template>
            </div>
            <div v-if="(quote.confirmations || []).length" class="confirmations">
              <b class="confirmations-title">生產細節確認</b>
              <div v-for="item in quote.confirmations" :key="item.id" class="confirmation-item" :class="'is-' + item.status">
                <div class="confirmation-row">
                  <span class="confirmation-label">
                    <b>{{ item.label }}</b>
                    <template v-if="item.value">：{{ item.value }}</template>
                  </span>
                  <el-tag v-if="item.status === 'confirmed'" size="small" type="success">已確認</el-tag>
                  <el-tag v-else-if="item.status === 'issue'" size="small" type="warning">已回覆問題</el-tag>
                </div>
                <p v-if="item.note" class="confirmation-note">{{ item.note }}</p>
                <p v-if="item.decidedNote" class="confirmation-note">我的回覆：{{ item.decidedNote }}</p>
                <div v-if="item.status === 'pending'" class="confirmation-actions">
                  <el-input
                    v-model="confirmationNotes[quote.id + ':' + item.id]"
                    size="small"
                    placeholder="想補充什麼都可以寫在這裡（選填）"
                    class="confirmation-note-input"
                  />
                  <el-button size="small" type="primary" @click="confirmItem(quote, item, 'confirmed')">確認無誤</el-button>
                  <el-button size="small" @click="confirmItem(quote, item, 'issue')">有問題</el-button>
                </div>
              </div>
            </div>
            <div class="quote-messages">
              <div v-for="msg in quote.messages || []" :key="msg.id" class="message" :class="msg.author">
                <b>{{ msg.authorName || msg.author }}</b>
                ：{{ msg.body }}
                <div v-if="(msg.attachments || []).length" class="message-attachments">
                  <img
                    v-for="att in msg.attachments"
                    :key="att.index"
                    :src="`/api/quote-messages/${quote.id}/${msg.id}/attachments/${att.index}`"
                    class="attachment-thumb"
                    loading="lazy"
                    @click="openAttachment(quote.id, msg.id, att.index)"
                  />
                </div>
              </div>
              <div class="message-input">
                <el-input v-model="messageDrafts[quote.id]" size="small" placeholder="輸入訊息…" @keyup.enter="sendMessage(quote)" />
                <el-upload
                  :auto-upload="false"
                  :show-file-list="false"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  :on-change="(file) => addMessageFiles(quote.id, file)"
                  class="message-upload"
                >
                  <el-button size="small" icon="Paperclip" />
                </el-upload>
                <el-button size="small" @click="sendMessage(quote)">送出</el-button>
              </div>
              <p v-if="(messageFiles[quote.id] || []).length" class="subtle">
                將附上 {{ messageFiles[quote.id].length }} 張圖片：
                {{ messageFiles[quote.id].map((f) => f.name).join('、') }}
                <el-button link size="small" @click="messageFiles[quote.id] = []">清除</el-button>
              </p>
            </div>
          </div>
          <div v-if="!quotes.length" class="empty-hint">目前沒有報價需求</div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="訂單" name="orders">
        <el-card v-for="order in orders" :key="order.id" shadow="never" class="portal-card">
          <div class="order-head">
            <b>{{ order.id }}</b>
            <el-tag size="small">{{ order.status }}</el-tag>
          </div>
          <p class="quote-meta">
            到期：{{ order.due }} · 金額：${{ order.value }}
            <span v-if="order.discount">· 折扣：-${{ order.discount }}</span>
          </p>
          <p v-if="order.payment" class="quote-meta">付款狀態：{{ order.payment.provider }} · {{ order.payment.status }}</p>

          <div v-if="trackingByOrder[order.id]" class="order-tracking">
            <p class="quote-meta">
              物流：{{ trackingByOrder[order.id].carrier || '尚未出貨' }}
              <template v-if="trackingByOrder[order.id].trackingNumber">
                · 追蹤號碼：{{ trackingByOrder[order.id].trackingNumber }}
              </template>
              <template v-if="trackingByOrder[order.id].status === 'not_configured'">·（Track.TW 尚未設定，暫無法查詢即時貨態）</template>
            </p>
          </div>

          <div class="order-actions">
            <el-button size="small" @click="loadTracking(order)">查詢物流</el-button>
            <el-button size="small" @click="startReorder(order)">再次訂購</el-button>
            <el-button size="small" @click="openCheckout(order)">結帳</el-button>
            <el-button size="small" @click="openCoupon(order)">套用優惠券</el-button>
            <el-button size="small" :disabled="!customer || !customer.loyaltyPoints" @click="openRedeem(order)">折抵點數</el-button>
          </div>
        </el-card>
        <div v-if="!orders.length" class="empty-hint">目前沒有訂單</div>
      </el-tab-pane>

      <el-tab-pane label="地址簿" name="addresses">
        <div class="quickbar">
          <el-button type="primary" size="small" icon="CirclePlus" @click="openAddressDialog()">新增地址</el-button>
        </div>
        <el-card v-for="address in addresses" :key="address.id" shadow="never" class="portal-card address-card">
          <div class="order-head">
            <b>{{ address.label }}</b>
            <el-tag v-if="address.isDefault" size="small" type="success">預設</el-tag>
          </div>
          <p class="quote-meta">{{ address.recipient }} · {{ address.phone }}</p>
          <p class="quote-meta">{{ address.line1 }} {{ address.line2 }}，{{ address.city }} {{ address.postalCode }}</p>
          <div class="order-actions">
            <el-button size="small" @click="openAddressDialog(address)">編輯</el-button>
            <el-button size="small" type="danger" @click="removeAddress(address)">刪除</el-button>
          </div>
        </el-card>
        <div v-if="!addresses.length" class="empty-hint">尚未新增地址</div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="previewVisible" title="檔案預覽 / DFM 檢查" width="480px">
      <div v-if="previewData">
        <model-viewer v-if="previewArrayBuffer" :array-buffer="previewArrayBuffer" :filename="previewData.name" :height="260" />
        <p>
          <b>{{ previewData.name }}</b>
          （{{ previewData.type }}）
        </p>
        <p>尺寸：{{ previewData.summary.dimensions.join(' × ') }} mm</p>
        <p>建構板佔用率：{{ previewData.buildPlate.occupancyPercent }}%（{{ previewData.buildPlate.fit }}）</p>
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

    <el-dialog v-model="checkoutVisible" title="結帳" width="380px">
      <p class="hint">選擇付款方式（尚未接上正式商店憑證的供應商會顯示「即將推出」）</p>
      <el-radio-group v-model="checkoutMethod" style="display: flex; flex-direction: column; gap: 8px">
        <el-radio v-for="method in paymentMethods" :key="method.id" :label="method.id" :disabled="!method.configured">
          {{ method.name }}
          <span v-if="!method.configured" class="hint">（即將推出）</span>
        </el-radio>
      </el-radio-group>
      <template #footer>
        <div>
          <el-button @click="checkoutVisible = false">取消</el-button>
          <el-button type="primary" :loading="checkingOut" @click="submitCheckout">確認</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="couponVisible" title="套用優惠券" width="360px">
      <el-input v-model="couponCode" placeholder="輸入優惠碼" />
      <template #footer>
        <div>
          <el-button @click="couponVisible = false">取消</el-button>
          <el-button type="primary" :loading="applyingCoupon" @click="submitCoupon">套用</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="redeemVisible" title="折抵點數" width="360px">
      <p class="hint">目前可用點數：{{ (customer && customer.loyaltyPoints) || 0 }}（100 點折抵 $10）</p>
      <el-input-number
        v-model="redeemPointsValue"
        :min="0"
        :max="(customer && customer.loyaltyPoints) || 0"
        style="width: 100%"
        controls-position="right"
      />
      <template #footer>
        <div>
          <el-button @click="redeemVisible = false">取消</el-button>
          <el-button type="primary" :loading="redeeming" @click="submitRedeem">折抵</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="addressDialogVisible" :title="addressForm.id ? '編輯地址' : '新增地址'" width="420px">
      <el-form label-width="80px" size="small">
        <el-form-item label="標籤"><el-input v-model="addressForm.label" /></el-form-item>
        <el-form-item label="收件人"><el-input v-model="addressForm.recipient" /></el-form-item>
        <el-form-item label="電話"><el-input v-model="addressForm.phone" /></el-form-item>
        <el-form-item label="地址一"><el-input v-model="addressForm.line1" /></el-form-item>
        <el-form-item label="地址二"><el-input v-model="addressForm.line2" /></el-form-item>
        <el-form-item label="城市"><el-input v-model="addressForm.city" /></el-form-item>
        <el-form-item label="郵遞區號"><el-input v-model="addressForm.postalCode" /></el-form-item>
        <el-form-item label="設為預設"><el-switch v-model="addressForm.isDefault" /></el-form-item>
      </el-form>
      <template #footer>
        <div>
          <el-button @click="addressDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingAddress" @click="submitAddress">儲存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import {
    fetchMyQuotes,
    fetchMyCases,
    fetchMyOrders,
    decideQuote,
    decideQuoteConfirmation,
    decideCase,
    sendQuoteMessage,
    fetchQuoteFilePreview,
    fetchQuoteFileRaw,
    fetchPaymentMethods,
    checkoutOrder,
    fetchOrderTracking,
    fetchAddresses,
    createAddress,
    updateAddress,
    deleteAddress,
    reorder,
    applyCoupon,
    redeemPoints,
  } from '@/api/customerPortal'
  import { fetchCustomerMe } from '@/api/customerAuth'
  import ModelViewer from '@/components/ModelViewer'

  export default {
    name: 'PortalDashboard',
    components: { ModelViewer },
    data() {
      return {
        tab: 'quotes',
        quotes: [],
        cases: [],
        orders: [],
        addresses: [],
        messageFiles: {},
        confirmationNotes: {},
        messageDrafts: {},
        previewVisible: false,
        previewBusy: '',
        previewData: null,
        previewArrayBuffer: null,
        trackingByOrder: {},
        checkoutVisible: false,
        checkoutOrderTarget: null,
        checkoutMethod: '',
        checkingOut: false,
        paymentMethods: [],
        couponVisible: false,
        couponOrderTarget: null,
        couponCode: '',
        applyingCoupon: false,
        redeemVisible: false,
        redeemOrderTarget: null,
        redeemPointsValue: 0,
        redeeming: false,
        addressDialogVisible: false,
        savingAddress: false,
        addressForm: this.emptyAddress(),
      }
    },
    computed: {
      ...mapGetters({ customer: 'customerAuth/customer' }),
    },
    async created() {
      // /portal/* 不走员工端 router 守卫（见 src/config/permission.js），此处自行检查客户端登入态
      if (!this.$store.getters['customerAuth/accessToken']) {
        this.$router.push('/portal/login')
        return
      }
      // 刷新页面后 customer 详情不在内存中（token 仍在 localStorage），需要重新拉取一次
      if (!this.customer) {
        const { customer } = await fetchCustomerMe()
        this.$store.commit('customerAuth/setCustomer', customer)
      }
      this.load()
    },
    methods: {
      emptyAddress() {
        return { id: '', label: '預設地址', recipient: '', phone: '', line1: '', line2: '', city: '', postalCode: '', isDefault: false }
      },
      async load() {
        const caseResult = await fetchMyCases()
        this.cases = caseResult.cases || []
        this.quotes = await fetchMyQuotes()
        this.orders = await fetchMyOrders()
        this.addresses = await fetchAddresses()
      },
      async decide(quote, decision) {
        const result = await decideQuote(quote.id, decision)
        const index = this.quotes.findIndex((q) => q.id === quote.id)
        if (index !== -1) this.quotes.splice(index, 1, result.quoteRequest || result)
        this.$baseMessage('已送出您的決定', 'success')
      },
      async decideUnifiedCase(caseItem, decision) {
        const result = await decideCase(caseItem.id, decision)
        const index = this.cases.findIndex((item) => item.id === caseItem.id)
        if (index !== -1) this.cases.splice(index, 1, result.case)
        this.$baseMessage('案件決定已送出', 'success')
      },
      contactSpecialist() {
        this.$baseMessage('請在原本的 LINE／Chatwoot 對話聯絡專員，由專員處理取消或終止製作。', 'info')
      },
      async sendMessage(quote) {
        const body = (this.messageDrafts[quote.id] || '').trim()
        const files = this.messageFiles[quote.id] || []
        if (!body && !files.length) return
        const result = await sendQuoteMessage(quote.id, body, files)
        const index = this.quotes.findIndex((q) => q.id === quote.id)
        if (index !== -1) this.quotes.splice(index, 1, result.quoteRequest)
        this.messageDrafts[quote.id] = ''
        this.messageFiles[quote.id] = []
      },
      addMessageFiles(quoteId, uploadFile) {
        const raw = uploadFile.raw || uploadFile
        if (!/^image\/(png|jpe?g|webp|gif)$/i.test(raw.type || '') && !/\.(png|jpe?g|webp|gif)$/i.test(raw.name || '')) {
          this.$baseMessage('只支援 PNG / JPG / WEBP / GIF 圖片。', 'warning')
          return
        }
        if (raw.size > 5 * 1024 * 1024) {
          this.$baseMessage('圖片上限 5MB。', 'warning')
          return
        }
        const list = this.messageFiles[quoteId] || (this.messageFiles[quoteId] = [])
        if (list.length >= 3) {
          this.$baseMessage('每則訊息最多 3 張圖片。', 'warning')
          return
        }
        list.push(raw)
      },
      openAttachment(quoteId, messageId, index) {
        window.open(`/api/quote-messages/${quoteId}/${messageId}/attachments/${index}`, '_blank', 'noopener')
      },
      async confirmItem(quote, item, decision) {
        const note = (this.confirmationNotes[`${quote.id}:${item.id}`] || '').trim()
        if (decision === 'issue' && !note && !(item.value || '').trim()) {
          this.$baseMessage('請寫下想調整的方向或直接用下方訊息欄說明，讓專員了解你的想法。', 'warning')
          return
        }
        const result = await decideQuoteConfirmation(quote.id, item.id, decision, note)
        const index = this.quotes.findIndex((q) => q.id === quote.id)
        if (index !== -1) this.quotes.splice(index, 1, result.quoteRequest)
        this.confirmationNotes[`${quote.id}:${item.id}`] = ''
        this.$baseMessage(decision === 'confirmed' ? '已確認，感謝回覆！' : '已把問題回覆給專員。', 'success')
      },
      async previewQuoteFile(quote) {
        this.previewBusy = quote.id
        this.previewArrayBuffer = null
        try {
          this.previewData = await fetchQuoteFilePreview(quote.id)
          this.previewVisible = true
          // 3D 檢視器需要原始檔案位元組；跟 DFM 摘要分開拉取，其中一個失敗不影響另一個顯示
          fetchQuoteFileRaw(quote.id)
            .then((buffer) => {
              this.previewArrayBuffer = buffer
            })
            .catch(() => {})
        } finally {
          this.previewBusy = ''
        }
      },
      async loadTracking(order) {
        const result = await fetchOrderTracking(order.id)
        this.trackingByOrder[order.id] = result
      },
      async startReorder(order) {
        const created = await reorder(order.id)
        this.orders.push(created)
        this.$baseMessage(`已建立新訂單 ${created.id}`, 'success')
      },
      async openCheckout(order) {
        this.checkoutOrderTarget = order
        this.paymentMethods = (await fetchPaymentMethods()).methods
        this.checkoutMethod = (this.paymentMethods.find((m) => m.configured) || this.paymentMethods[0] || {}).id || ''
        this.checkoutVisible = true
      },
      async submitCheckout() {
        if (!this.checkoutMethod) {
          this.$baseMessage('請選擇付款方式', 'warning')
          return
        }
        this.checkingOut = true
        try {
          const result = await checkoutOrder(this.checkoutOrderTarget.id, this.checkoutMethod)
          const index = this.orders.findIndex((o) => o.id === this.checkoutOrderTarget.id)
          if (index !== -1) this.orders[index].payment = result.payment
          this.$baseMessage(result.payment.message || '結帳請求已送出', result.ok ? 'success' : 'warning')
          this.checkoutVisible = false
        } finally {
          this.checkingOut = false
        }
      },
      openCoupon(order) {
        this.couponOrderTarget = order
        this.couponCode = ''
        this.couponVisible = true
      },
      async submitCoupon() {
        if (!this.couponCode.trim()) {
          this.$baseMessage('請輸入優惠碼', 'warning')
          return
        }
        this.applyingCoupon = true
        try {
          const result = await applyCoupon(this.couponOrderTarget.id, this.couponCode.trim())
          const index = this.orders.findIndex((o) => o.id === this.couponOrderTarget.id)
          if (index !== -1) this.orders.splice(index, 1, result.order)
          this.$baseMessage(`已套用優惠券，折抵 $${result.discount}`, 'success')
          this.couponVisible = false
        } finally {
          this.applyingCoupon = false
        }
      },
      openRedeem(order) {
        this.redeemOrderTarget = order
        this.redeemPointsValue = 0
        this.redeemVisible = true
      },
      async submitRedeem() {
        if (!this.redeemPointsValue) {
          this.$baseMessage('請輸入要折抵的點數', 'warning')
          return
        }
        this.redeeming = true
        try {
          const result = await redeemPoints(this.redeemOrderTarget.id, this.redeemPointsValue)
          const index = this.orders.findIndex((o) => o.id === this.redeemOrderTarget.id)
          if (index !== -1) this.orders.splice(index, 1, result.order)
          this.$store.commit('customerAuth/setCustomer', { ...this.customer, loyaltyPoints: result.remainingPoints })
          this.$baseMessage('點數已折抵', 'success')
          this.redeemVisible = false
        } finally {
          this.redeeming = false
        }
      },
      openAddressDialog(address) {
        this.addressForm = address ? { ...address } : this.emptyAddress()
        this.addressDialogVisible = true
      },
      async submitAddress() {
        if (!this.addressForm.recipient || !this.addressForm.phone || !this.addressForm.line1) {
          this.$baseMessage('請填寫收件人、電話、地址一', 'warning')
          return
        }
        this.savingAddress = true
        try {
          const { id, ...payload } = this.addressForm
          if (id) {
            const updated = await updateAddress(id, payload)
            const index = this.addresses.findIndex((a) => a.id === id)
            if (index !== -1) this.addresses.splice(index, 1, updated)
          } else {
            const created = await createAddress(payload)
            this.addresses.push(created)
          }
          this.addresses.forEach((a) => {
            if (payload.isDefault && a.id !== id) a.isDefault = false
          })
          this.$baseMessage('地址已儲存', 'success')
          this.addressDialogVisible = false
        } finally {
          this.savingAddress = false
        }
      },
      async removeAddress(address) {
        this.$baseConfirm(`確定要刪除「${address.label}」嗎？`, null, async () => {
          await deleteAddress(address.id)
          this.addresses = this.addresses.filter((a) => a.id !== address.id)
          this.$baseMessage('已刪除', 'success')
        })
      },
    },
  }
</script>

<style lang="scss" scoped>
  .welcome-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .points-badge {
    font-size: 13px;
    color: $base-color-gray;

    b {
      color: $base-color-orange;
      font-size: 16px;
    }
  }

  .portal-card {
    margin-bottom: 16px;
  }

  .quote-item {
    padding: 12px 0;
    border-bottom: 1px dashed $base-border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  .quote-head,
  .order-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .quote-meta {
    color: $base-color-gray;
    font-size: 13px;
  }

  .quote-actions,
  .order-actions {
    margin: 6px 0;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .confirmations {
    margin: 10px 0;
    border: 1px solid #e3e9f4;
    border-radius: 10px;
    padding: 10px 12px;

    .confirmations-title {
      font-size: 13px;
      color: #475467;
    }

    .confirmation-item {
      padding: 8px 0;
      border-bottom: 1px dashed #edf0f5;

      &:last-child {
        border-bottom: 0;
      }
      &.is-confirmed .confirmation-label {
        color: #1c7c44;
      }
      &.is-issue .confirmation-label {
        color: #b25e02;
      }

      .confirmation-row {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
        font-size: 13px;
      }
      .confirmation-note {
        margin: 4px 0 0;
        font-size: 12px;
        color: #667085;
        white-space: pre-wrap;
      }
      .confirmation-actions {
        display: flex;
        gap: 8px;
        margin-top: 6px;
        align-items: center;
        flex-wrap: wrap;
      }
      .confirmation-note-input {
        flex: 1;
        min-width: 180px;
      }
    }
  }

  .message-attachments {
    display: flex;
    gap: 8px;
    margin-top: 6px;
    flex-wrap: wrap;

    .attachment-thumb {
      width: 72px;
      height: 72px;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid #e3e9f4;
      cursor: zoom-in;
      background: #fff;
    }
  }

  .quote-messages {
    .message {
      font-size: 13px;
      margin-bottom: 4px;

      &.customer {
        color: $base-color-blue;
      }
    }

    .message-input {
      display: flex;
      gap: 8px;
      margin-top: 6px;
    }
  }

  .quickbar {
    margin-bottom: 12px;
  }

  .hint {
    color: $base-color-gray;
    font-size: 12px;
  }

  .empty-hint {
    color: $base-color-gray;
    padding: 12px 0;
  }
</style>
