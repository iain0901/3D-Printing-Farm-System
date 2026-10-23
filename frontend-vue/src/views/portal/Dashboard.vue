<template>
  <div class="portal-dashboard">
    <div class="welcome-row">
      <div>
        <p class="welcome-eyebrow">每個想法，都有下一步。</p>
        <h1>
          你好，{{ (customer && customer.name) || '會員' }}
          <span>。</span>
        </h1>
        <p class="welcome-description">讓製作的每一步，都清楚可見。</p>
      </div>
      <router-link class="new-project" to="/quote">
        新增列印估價
        <span aria-hidden="true">↗</span>
      </router-link>
    </div>
    <section class="member-summary" aria-label="會員概況" :aria-busy="loading">
      <div>
        <span>進行中案件</span>
        <strong>
          {{ loading || loadError ? '—' : summary.active }}
          <small>件</small>
        </strong>
        <p>從確認需求到製作交付</p>
      </div>
      <div class="attention-stat">
        <span>等待您的回覆</span>
        <strong>
          {{ loading || loadError ? '—' : summary.awaiting }}
          <small>件</small>
        </strong>
        <p>報價、補件與生產細節</p>
      </div>
      <div>
        <span>已完成案件</span>
        <strong>
          {{ loading || loadError ? '—' : summary.completed }}
          <small>件</small>
        </strong>
        <p>每一件，都是想法的實現</p>
      </div>
      <div class="points-stat">
        <span>可用會員點數</span>
        <strong>
          {{ (customer && customer.loyaltyPoints) || 0 }}
          <small>點</small>
        </strong>
        <p>結帳時可使用點數折抵</p>
      </div>
    </section>
    <div class="section-heading">
      <div>
        <h2>{{ currentSection.label }}</h2>
        <p>{{ currentSection.description }}</p>
      </div>
      <button class="refresh-button" :disabled="loading" @click="load">{{ loading ? '更新中…' : '重新整理 ↻' }}</button>
    </div>
    <div v-if="loadError" class="load-error" role="alert">
      <b>暫時無法載入會員資料</b>
      <p>您的資料不會因此刪除，請稍後重新整理。</p>
      <el-button @click="load">重新載入</el-button>
    </div>
    <div v-else-if="loading" class="loading-panel" role="status">
      <el-skeleton :rows="4" animated />
      <p>正在整理您的製作進度…</p>
    </div>
    <el-tabs v-else v-model="tab" class="member-panels">
      <el-tab-pane label="3D 列印案件" name="cases">
        <el-card shadow="never" class="portal-card">
          <div v-for="caseItem in cases" :key="caseItem.id" class="quote-item">
            <div class="quote-head">
              <b>{{ caseItem.project }}</b>
              <el-tag size="small" :type="statusType(caseItem.status)">{{ statusLabel(caseItem.status) }}</el-tag>
            </div>
            <p class="quote-meta">案件編號：{{ caseItem.caseNo }} · {{ caseItem.parts.length }} 個零件</p>
            <router-link class="case-detail-link" :to="{ path: '/portal/workspace', query: { section: 'case', id: caseItem.id } }">
              查看完整案件、進度與對話 ↗
            </router-link>
            <p v-if="caseItem.quote" class="quote-price">
              {{ money(caseItem.quote.total) }}
              <span>報價總額</span>
            </p>
            <p v-if="caseItem.delivery && caseItem.delivery.trackingNumber" class="quote-meta">
              物流追蹤：{{ caseItem.delivery.trackingNumber }}
            </p>
            <div v-if="caseItem.status === 'formal_quote_sent'" class="quote-actions">
              <el-button size="small" type="primary" @click="decideUnifiedCase(caseItem, 'accepted')">接受報價</el-button>
              <el-button size="small" @click="decideUnifiedCase(caseItem, 'revision')">要求修改</el-button>
              <el-button size="small" @click="contactSpecialist">取消請聯絡專員</el-button>
            </div>
            <p class="hint">可在案件詳情留言、確認進度或提交售後申請。</p>
          </div>
          <div v-if="!cases.length" class="empty-hint">
            <span class="empty-index">01 / 開始製作</span>
            <h3>第一件作品，從這裡開始。</h3>
            <p>上傳模型，使用自動估價確認製作需求。送出後就能在這裡追蹤案件。</p>
            <router-link to="/quote">上傳模型並估價 ↗</router-link>
          </div>
        </el-card>
      </el-tab-pane>
      <el-tab-pane label="報價需求" name="quotes">
        <el-card shadow="never" class="portal-card">
          <div v-for="quote in quotes" :key="quote.id" class="quote-item">
            <div class="quote-head">
              <b>{{ quote.project }}</b>
              <el-tag size="small" :type="statusType(quote.status)">{{ statusLabel(quote.status) }}</el-tag>
            </div>
            <p class="quote-meta">材料：{{ quote.material }} · 數量：{{ quote.quantity }}</p>
            <p class="quote-price">
              {{ money(quote.quotedValue) }}
              <span>報價金額</span>
            </p>
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
                    :aria-label="item.label + '補充說明'"
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
                    alt="對話附件，點擊查看原圖"
                    role="button"
                    tabindex="0"
                    @keydown.enter="openAttachment(quote.id, msg.id, att.index)"
                    loading="lazy"
                    @click="openAttachment(quote.id, msg.id, att.index)"
                  />
                </div>
              </div>
              <div class="message-input">
                <el-input
                  v-model="messageDrafts[quote.id]"
                  size="small"
                  aria-label="給專員的訊息"
                  placeholder="輸入訊息…"
                  @keyup.enter="sendMessage(quote)"
                />
                <el-upload
                  :auto-upload="false"
                  :show-file-list="false"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  :on-change="(file) => addMessageFiles(quote.id, file)"
                  class="message-upload"
                >
                  <el-button size="small" icon="Paperclip" aria-label="附加圖片" />
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
          <div v-if="!quotes.length" class="empty-hint">
            <span class="empty-index">02 / 討論需求</span>
            <h3>把想法交給我們，一起確認細節。</h3>
            <p>報價內容與專員訊息會保留在這裡，方便您隨時接著討論。</p>
            <router-link to="/quote">開始自動估價 ↗</router-link>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="訂單" name="orders">
        <el-card v-for="order in orders" :key="order.id" shadow="never" class="portal-card order-card">
          <div class="order-head">
            <b>{{ order.id }}</b>
            <el-tag size="small" :type="statusType(order.status)">{{ statusLabel(order.status) }}</el-tag>
          </div>
          <p class="quote-meta">
            預定交期：{{ order.due || '待確認' }}
            <span v-if="order.discount">· 折扣：{{ money(order.discount) }}</span>
          </p>
          <p class="quote-price">
            {{ money(order.value) }}
            <span>訂單金額</span>
          </p>
          <p v-if="order.payment" class="quote-meta">付款狀態：{{ statusLabel(order.payment.status) }}</p>
          <p v-if="order.requiresRequote" class="quote-meta">再次製作需求已建立，價格與交期將重新確認。</p>

          <div class="order-tracking" v-if="trackingByOrder[order.id]">
            <p class="quote-meta">
              物流：{{ trackingByOrder[order.id].carrier || '尚未出貨' }}
              <template v-if="trackingByOrder[order.id].trackingNumber">
                · 追蹤號碼：{{ trackingByOrder[order.id].trackingNumber }}
              </template>
              <template v-if="trackingByOrder[order.id].status === 'not_configured'">·（Track.TW 尚未設定，暫無法查詢即時貨態）</template>
            </p>
            <a
              v-if="trackingPortal(trackingByOrder[order.id].carrier)"
              :href="trackingPortal(trackingByOrder[order.id].carrier)"
              target="_blank"
              rel="noopener noreferrer"
            >
              前往物流公司查詢 ↗
            </a>
          </div>

          <div class="order-actions">
            <el-button size="small" @click="loadTracking(order)">查詢物流</el-button>
            <el-button size="small" @click="startReorder(order)">再次訂購</el-button>
            <el-button size="small" @click="openCheckout(order)">結帳</el-button>
            <el-button size="small" @click="openCoupon(order)">套用優惠券</el-button>
            <el-button size="small" :disabled="!customer || !customer.loyaltyPoints" @click="openRedeem(order)">折抵點數</el-button>
          </div>
        </el-card>
        <div v-if="!orders.length" class="empty-hint">
          <span class="empty-index">03 / 安心交付</span>
          <h3>目前還沒有訂單。</h3>
          <p>訂單建立後，您可以在這裡付款、查詢物流與再次訂購。</p>
          <router-link to="/quote">開始新的製作計畫 ↗</router-link>
        </div>
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
        <div v-if="!addresses.length" class="empty-hint">
          <span class="empty-index">04 / 收件準備</span>
          <h3>作品，要送到哪裡？</h3>
          <p>新增常用地址，下一次訂購就不必重新填寫。</p>
          <el-button @click="openAddressDialog()">新增第一個地址</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog class="brand-dialog" title="檔案預覽 / DFM 檢查" v-model="previewVisible" width="480px">
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

    <el-dialog class="brand-dialog" title="結帳" v-model="checkoutVisible" width="380px">
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
          <el-button type="primary" :loading="checkingOut" :disabled="!canCheckout" @click="submitCheckout">確認</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog class="brand-dialog" title="套用優惠券" v-model="couponVisible" width="360px">
      <el-input v-model="couponCode" aria-label="優惠碼" placeholder="輸入優惠碼" />
      <template #footer>
        <div>
          <el-button @click="couponVisible = false">取消</el-button>
          <el-button type="primary" :loading="applyingCoupon" @click="submitCoupon">套用</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog class="brand-dialog" title="折抵點數" v-model="redeemVisible" width="360px">
      <p class="hint">目前可用點數：{{ (customer && customer.loyaltyPoints) || 0 }}（100 點折抵 $10）</p>
      <el-input-number
        v-model="redeemPointsValue"
        aria-label="折抵點數"
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

    <el-dialog class="brand-dialog" :title="addressForm.id ? '編輯地址' : '新增地址'" v-model="addressDialogVisible" width="420px">
      <el-form label-width="80px" size="small">
        <el-form-item label="標籤"><el-input v-model="addressForm.label" aria-label="地址標籤" /></el-form-item>
        <el-form-item label="收件人"><el-input v-model="addressForm.recipient" aria-label="收件人" autocomplete="name" /></el-form-item>
        <el-form-item label="電話"><el-input v-model="addressForm.phone" aria-label="電話" autocomplete="tel" /></el-form-item>
        <el-form-item label="地址一">
          <el-input v-model="addressForm.line1" aria-label="地址一" autocomplete="address-line1" />
        </el-form-item>
        <el-form-item label="地址二">
          <el-input v-model="addressForm.line2" aria-label="地址二" autocomplete="address-line2" />
        </el-form-item>
        <el-form-item label="城市"><el-input v-model="addressForm.city" aria-label="城市" autocomplete="address-level2" /></el-form-item>
        <el-form-item label="郵遞區號">
          <el-input v-model="addressForm.postalCode" aria-label="郵遞區號" autocomplete="postal-code" />
        </el-form-item>
        <el-form-item label="設為預設"><el-switch v-model="addressForm.isDefault" aria-label="設為預設地址" /></el-form-item>
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
  import { workspace } from '@/api/memberWorkspace'
  import ModelViewer from '@/components/ModelViewer'
  import {
    portalSection,
    portalStatus,
    portalStatusType,
    portalMoney,
    portalSummary,
    trackingPortal,
  } from '@/utils/portal-presentation.mjs'

  export default {
    name: 'PortalDashboard',
    components: { ModelViewer },
    data() {
      return {
        loading: true,
        loadError: false,
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
      tab: {
        get() {
          return portalSection(this.$route.query.tab).id
        },
        set(value) {
          this.$router.replace({ query: { ...this.$route.query, tab: value } })
        },
      },
      currentSection() {
        return portalSection(this.tab)
      },
      summary() {
        return portalSummary(this.cases, this.quotes)
      },
      canCheckout() {
        return this.paymentMethods.some((method) => method.id === this.checkoutMethod && method.configured)
      },
    },
    async created() {
      // /portal/* 不走员工端 router 守卫（见 src/config/permission.js），此处自行检查客户端登入态
      if (!this.$store.getters['customerAuth/accessToken']) {
        this.$router.push('/portal/login')
        return
      }
      this.load()
    },
    methods: {
      trackingPortal,
      statusLabel: portalStatus,
      statusType: portalStatusType,
      money: portalMoney,
      emptyAddress() {
        return { id: '', label: '預設地址', recipient: '', phone: '', line1: '', line2: '', city: '', postalCode: '', isDefault: false }
      },
      async load() {
        this.loading = true
        this.loadError = false
        try {
          if (!this.customer) {
            const { customer } = await fetchCustomerMe()
            this.$store.commit('customerAuth/setCustomer', customer)
          }
          const [caseResult, quotes, orders, addresses] = await Promise.all([
            fetchMyCases(),
            fetchMyQuotes(),
            fetchMyOrders(),
            fetchAddresses(),
          ])
          this.cases = caseResult.cases || []
          this.quotes = quotes
          this.orders = orders
          this.addresses = addresses
        } catch {
          this.loadError = true
        } finally {
          this.loading = false
        }
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
        const note = (this.confirmationNotes[quote.id + ':' + item.id] || '').trim()
        if (decision === 'issue' && !note && !(item.value || '').trim()) {
          this.$baseMessage('請寫下想調整的方向或直接用下方訊息欄說明，讓專員了解你的想法。', 'warning')
          return
        }
        const result = await decideQuoteConfirmation(quote.id, item.id, decision, note)
        const index = this.quotes.findIndex((q) => q.id === quote.id)
        if (index !== -1) this.quotes.splice(index, 1, result.quoteRequest)
        this.confirmationNotes[quote.id + ':' + item.id] = ''
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
        if (order.caseId) {
          const result = await workspace(`/cases/${order.caseId}/reorder-draft`, 'post', {})
          await this.$router.push({ path: '/quote', query: { draft: result.draft.id } })
          return
        }
        const created = await reorder(order.id)
        this.orders.push(created)
        this.$baseMessage(`已建立重新報價需求 ${created.id}`, 'success')
      },
      async openCheckout(order) {
        this.checkoutOrderTarget = order
        this.paymentMethods = (await fetchPaymentMethods()).methods
        this.checkoutMethod = (this.paymentMethods.find((m) => m.configured) || this.paymentMethods[0] || {}).id || ''
        this.checkoutVisible = true
      },
      async submitCheckout() {
        if (!this.canCheckout) {
          this.$baseMessage('請選擇已開放的付款方式', 'warning')
          return
        }
        this.checkingOut = true
        try {
          const result = await checkoutOrder(this.checkoutOrderTarget.id, this.checkoutMethod)
          const index = this.orders.findIndex((o) => o.id === this.checkoutOrderTarget.id)
          if (index !== -1) this.orders[index].payment = result.payment
          this.$baseMessage(result.payment.message || '結帳請求已送出', result.ok ? 'success' : 'warning')
          this.checkoutVisible = false
          if (result.ok && result.payment.redirectUrl) window.location.assign(result.payment.redirectUrl)
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
  .portal-dashboard {
    overflow-wrap: anywhere;
  }
  .welcome-eyebrow {
    margin: 0 0 12px;
    font-size: 11px;
    letter-spacing: 2px;
    color: var(--member-muted);
  }
  h1 {
    margin: 0;
    font-size: var(--rfm-title-workspace);
    font-weight: 600;
    letter-spacing: -1px;
    line-height: 1.35;
  }
  h1 span {
    color: var(--rfm-accent);
  }
  .welcome-description {
    margin: 12px 0 0;
    color: var(--member-muted);
    font-size: 13px;
  }
  .new-project {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 36px;
    padding: 14px 20px;
    color: var(--rfm-surface);
    background: var(--rfm-ink);
    border-radius: var(--rfm-radius-control);
    font-size: 13px;
    white-space: nowrap;
  }
  .new-project:hover {
    background: var(--rfm-ink);
  }
  .member-summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    margin: 32px 0 38px;
    border: 1px solid var(--member-line);
    border-radius: var(--rfm-radius-panel);
    overflow: hidden;
    background: var(--rfm-surface);
  }
  .member-summary > div {
    padding: 22px 24px;
    border-right: 1px solid var(--member-line);
  }
  .member-summary > div:last-child {
    border: 0;
  }
  .member-summary span {
    display: block;
    color: var(--member-muted);
    font-size: 12px;
  }
  .member-summary strong {
    display: block;
    margin-top: 10px;
    font-size: 34px;
    font-weight: 500;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
  }
  .member-summary small {
    margin-left: 8px;
    font-size: 11px;
    font-weight: 400;
    color: var(--member-muted);
  }
  .member-summary p {
    font-size: 10px;
    color: var(--member-muted);
    margin: 8px 0 0;
  }
  .attention-stat strong {
    color: #896119;
  }
  .member-summary .points-stat {
    background: #edf1e7;
  }
  .section-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
    margin-bottom: 22px;
  }
  .section-heading h2 {
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 6px;
  }
  .section-heading p {
    font-size: 12px;
    color: var(--member-muted);
    margin: 0;
  }
  .refresh-button {
    border: 0;
    background: transparent;
    font: inherit;
    font-size: 12px;
    color: var(--member-muted);
    white-space: nowrap;
    cursor: pointer;
    padding: 8px 0;
  }
  .refresh-button:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  .load-error,
  .loading-panel {
    padding: 32px;
    border: 1px solid var(--member-line);
    border-radius: var(--rfm-radius-panel);
    background: var(--rfm-surface);
  }
  .load-error p,
  .loading-panel p {
    font-size: 13px;
    color: var(--member-muted);
  }
  .member-panels :deep(.el-tabs__header) {
    display: none;
  }
  .member-panels :deep(.el-card__body) {
    padding: 0;
  }
  .member-panels :deep(.el-card) {
    border: 1px solid var(--member-line);
    border-radius: var(--rfm-radius-panel);
    color: var(--member-ink);
    background: var(--rfm-surface);
  }
  .member-panels :deep(.order-card .el-card__body),
  .member-panels :deep(.address-card .el-card__body) {
    padding: 26px;
  }
  .quote-price {
    font-size: 22px;
    font-weight: 500;
    margin: 18px 0;
    font-variant-numeric: tabular-nums;
  }
  .quote-price span {
    display: inline-block;
    color: var(--member-muted);
    font-size: 11px;
    font-weight: 400;
    margin-left: 12px;
  }
  .quote-head > b,
  .order-head > b {
    font-size: 16px;
    font-weight: 600;
  }
  .welcome-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }

  .portal-card {
    margin-bottom: 16px;
  }

  .quote-item {
    padding: 26px;
    border-bottom: 1px solid var(--member-line);

    &:last-child {
      border-bottom: none;
    }
  }

  .quote-head,
  .order-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .quote-meta {
    color: var(--member-muted);
    font-size: 12px;
  }

  .quote-actions,
  .order-actions {
    margin: 18px 0 8px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .confirmations {
    margin: 10px 0;
    border: 1px solid var(--member-line);
    border-radius: var(--rfm-radius-control);
    padding: 16px;
    background: var(--rfm-workspace);

    .confirmations-title {
      font-size: 13px;
      color: #475467;
    }

    .confirmation-item {
      padding: 8px 0;
      border-bottom: 1px dashed var(--rfm-selected);

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
        color: var(--rfm-muted);
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
      border-radius: var(--rfm-radius-panel);
      border: 1px solid #e3e9f4;
      cursor: zoom-in;
      background: var(--rfm-surface);
    }
  }

  .quote-messages {
    margin-top: 22px;
    border-top: 1px solid var(--member-line);
    padding-top: 18px;
    .message {
      font-size: 13px;
      margin-bottom: 10px;
      padding: 10px 14px;
      background: #f0f2ec;
      border-radius: var(--rfm-radius-control);

      &.customer {
        color: var(--rfm-ink);
        background: var(--rfm-selected);
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
    color: var(--member-muted);
    font-size: 12px;
  }

  .empty-hint {
    color: var(--member-muted);
    padding: 56px 28px;
    text-align: center;
    border: 1px solid var(--member-line);
    border-radius: var(--rfm-radius-panel);
    background: var(--rfm-surface);
    .empty-index {
      font-size: 10px;
      letter-spacing: 2px;
      color: #897346;
    }
    h3 {
      color: var(--member-ink);
      font-size: 20px;
      font-weight: 500;
      margin: 16px 0 12px;
    }
    p {
      font-size: 13px;
      margin: 0 auto 24px;
      max-width: 390px;
    }
    a {
      display: inline-block;
      color: var(--member-ink);
      font-size: 13px;
      padding: 8px 0;
      border-bottom: 1px solid #829282;
    }
  }
  .portal-card .empty-hint {
    border: 0;
  }
  @media (max-width: 1100px) {
    .member-summary > div {
      padding: 18px 16px;
    }
    .member-summary p {
      max-width: 100px;
    }
  }
  @media (max-width: 700px) {
    .welcome-row {
      align-items: flex-start;
      flex-direction: column;
      gap: 22px;
    }
    .new-project {
      width: 100%;
    }
    .member-summary {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin: 24px 0 28px;
    }
    .member-summary > div {
      padding: 18px;
    }
    .member-summary > div:nth-child(2) {
      border-right: 0;
    }
    .member-summary > div:nth-child(-n + 2) {
      border-bottom: 1px solid var(--member-line);
    }
    .member-summary strong {
      font-size: 30px;
    }
    .member-summary p {
      max-width: none;
      font-size: 10px;
    }
    .section-heading {
      align-items: flex-start;
      gap: 12px;
    }
    .quote-item {
      padding: 20px 16px;
    }
    .member-panels :deep(.order-card .el-card__body),
    .member-panels :deep(.address-card .el-card__body) {
      padding: 20px 16px;
    }
    .quote-head,
    .order-head {
      flex-wrap: wrap;
      gap: 8px;
    }
    .quote-messages .message-input {
      flex-wrap: wrap;
    }
    .message-input > .el-input {
      flex-basis: 100%;
    }
    .empty-hint {
      padding: 36px 20px;
    }
    .empty-hint h3 {
      font-size: 18px;
    }
  }
</style>
