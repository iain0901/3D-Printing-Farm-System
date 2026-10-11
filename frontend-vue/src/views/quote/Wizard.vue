<template>
  <public-shell>
    <div class="quote-page">
      <div v-if="inquiryService" class="quote-context" role="note">
        <div>
          <b>{{ inquiryService.title }}・自動估價</b>
          <p>已帶入用途提示。上傳模型後設定材料與數量，由既有估價系統試算；備註可自行修改。</p>
        </div>
        <router-link :to="`/services/${inquiryService.id}`">回到用途介紹 ↗</router-link>
      </div>
      <section class="quote-intro">
        <div>
          <p class="studio-kicker">3DRFM・線上製作需求</p>
          <h1>開始你的製作計畫</h1>
          <p>
            從一個模型或一段描述開始。
            <br />
            先整理需求，再一起確認製作方式與報價。
          </p>
          <span class="quote-intro-note">先整理需求・第三步登入或註冊帶入資料</span>
        </div>
      </section>
      <section class="quote-shell">
        <el-steps :active="step" finish-status="success" align-center>
          <el-step title="服務方式" />
          <el-step title="模型或需求" />
          <el-step title="登入與資料" />
          <el-step title="列印設定" />
          <el-step title="確認送出" />
        </el-steps>

        <el-card shadow="never" class="wizard-card">
          <section v-show="step === 0" class="step-content">
            <h2>你想怎麼開始？</h2>
            <div class="mode-grid">
              <button
                class="mode-card"
                :aria-pressed="form.mode === 'estimate'"
                :class="{ selected: form.mode === 'estimate' }"
                @click="form.mode = 'estimate'"
              >
                <el-icon><DataAnalysis /></el-icon>
                <b>自動估價</b>
                <span>送出條件後取得初步預估；實際金額以真實切片結果確認</span>
              </button>
              <button
                class="mode-card"
                :aria-pressed="form.mode === 'agent'"
                :class="{ selected: form.mode === 'agent' }"
                @click="form.mode = 'agent'"
              >
                <el-icon><Service /></el-icon>
                <b>專員協助</b>
                <span>由專員確認材料、建模與製程</span>
              </button>
            </div>
            <el-form label-position="top" class="choice-form">
              <el-form-item label="目前是否已有 3D 模型？">
                <el-radio-group v-model="form.hasModel">
                  <el-radio :label="true">有，準備上傳 STL／3MF／STEP</el-radio>
                  <el-radio :label="false">還沒有，需要建模協助</el-radio>
                </el-radio-group>
              </el-form-item>
            </el-form>
          </section>

          <section v-show="step === 1" class="step-content">
            <template v-if="form.hasModel">
              <h2>上傳模型檔案</h2>
              <p class="subtle">可同時上傳多個 STL、3MF、STEP／STP；每個檔案上限 100 MB。</p>
              <el-upload
                drag
                multiple
                action=""
                :auto-upload="false"
                :file-list="fileList"
                :on-change="onFileChange"
                :on-remove="onFileRemove"
                :before-upload="validateModelFile"
                accept=".stl,.3mf,.step,.stp"
              >
                <el-icon><UploadFilled /></el-icon>
                <div class="el-upload__text">
                  拖曳模型至此，或
                  <em>選擇檔案</em>
                </div>
              </el-upload>
              <el-alert
                v-if="fileList.length"
                type="success"
                :closable="false"
                show-icon
                title="檔案會以私有儲存方式處理；解析異常時保留案件並交由專員檢查。"
              />
              <div v-if="fileList.length" class="model-preview-block">
                <model-viewer
                  :file="previewFile"
                  :filename="previewName"
                  :height="260"
                  :part-colors="previewPartColors"
                  @error="onPreviewError"
                />
                <p class="subtle preview-note">
                  模型預覽只顯示組裝後的位置，不會自動拆開；灰色代表尚未選擇實際耗材色。3MF 內嵌顏色僅供辨識，仍請在下方指定成品顏色。
                </p>
                <div v-if="fileList.length > 1" class="preview-switch">
                  <button
                    v-for="(item, index) in fileList"
                    :key="item.uid"
                    type="button"
                    class="preview-tab"
                    :class="{ active: index === previewIndex }"
                    @click="previewIndex = index"
                  >
                    {{ item.name }}
                  </button>
                </div>
                <p v-if="previewError" class="subtle">此格式無法在瀏覽器預覽（STEP 等），仍可正常送出，由專員轉檔處理。</p>
              </div>
              <div v-if="parts.length" class="part-list">
                <h3>零件設定</h3>
                <p class="subtle">
                  每一行對應一個上傳檔案。只需在這裡設定一次材料、成品顏色與數量；下個步驟不會重複要求。若選色方塊後還有
                  Pantone／色名，再填右側說明即可。
                </p>
                <div v-for="part in parts" :key="part.localId" class="part-row">
                  <el-input v-model="part.name" size="small" />
                  <el-select v-model="part.material" size="small">
                    <el-option v-for="item in materials" :key="item" :label="materialLabel(item)" :value="item" />
                  </el-select>
                  <span class="color-cell">
                    <el-color-picker v-model="part.colorHex" size="small" :predefine="palette" />
                    <el-input v-model="part.color" size="small" placeholder="顏色說明（選填）" />
                  </span>
                  <el-input-number v-model="part.quantity" :min="1" :max="10000" size="small" />
                </div>
              </div>
            </template>
            <template v-else>
              <h2>告訴我們你想製作什麼</h2>
              <el-form label-position="top">
                <el-form-item label="用途與需求" required>
                  <el-input
                    v-model="form.purpose"
                    type="textarea"
                    :rows="4"
                    placeholder="例如：依照電路板尺寸製作可鎖牆的外殼、需要防水與走線孔。"
                  />
                </el-form-item>
                <el-form-item label="關鍵尺寸、草圖或照片">
                  <el-input
                    v-model="form.criticalDimensions"
                    type="textarea"
                    :rows="3"
                    placeholder="可填寫長寬高、孔位、配合物尺寸；照片與草圖可在送出後由 Chatwoot 對話補件。"
                  />
                </el-form-item>
                <el-form-item label="草圖、照片或需求 PDF">
                  <el-upload
                    action=""
                    :auto-upload="false"
                    multiple
                    :file-list="attachmentList"
                    :on-change="onAttachmentChange"
                    :on-remove="onAttachmentRemove"
                    :before-upload="validateAttachmentFile"
                    accept=".png,.jpg,.jpeg,.webp,.pdf"
                  >
                    <el-button size="small" icon="Paperclip">選擇附件</el-button>
                    <template #tip><span class="el-upload__tip">每個附件上限 100 MB。</span></template>
                  </el-upload>
                </el-form-item>
              </el-form>
            </template>
          </section>

          <section v-show="step === 2" class="step-content">
            <h2>登入後，帶入你的聯絡資料</h2>
            <p class="subtle">建立會員後可在會員中心查看案件；案件名稱由系統依日期、使用者與模型序號自動產生。</p>
            <section v-if="customer" class="member-summary">
              <div>
                <p class="studio-kicker">已登入會員</p>
                <h3>{{ customer.name }}</h3>
                <p>
                  {{ customer.email || '未提供電子郵件' }}
                  <span v-if="customer.phone">・{{ customer.phone }}</span>
                </p>
              </div>
              <el-button plain @click="switchAccount">切換帳號</el-button>
            </section>
            <section v-else class="account-choice">
              <div class="account-tabs" role="tablist" aria-label="會員操作">
                <button
                  type="button"
                  :class="{ active: authMode === 'login' }"
                  role="tab"
                  :aria-selected="authMode === 'login'"
                  @click="authMode = 'login'"
                >
                  登入會員
                </button>
                <button
                  type="button"
                  :class="{ active: authMode === 'register' }"
                  role="tab"
                  :aria-selected="authMode === 'register'"
                  @click="authMode = 'register'"
                >
                  建立帳號
                </button>
              </div>
              <el-form v-if="authMode === 'login'" label-position="top" class="account-form" @submit.prevent="loginForQuote">
                <el-form-item label="電子郵件"><el-input v-model.trim="authForm.email" type="email" autocomplete="email" /></el-form-item>
                <el-form-item label="密碼">
                  <el-input v-model="authForm.password" type="password" autocomplete="current-password" show-password />
                </el-form-item>
                <el-button type="primary" native-type="submit" :loading="authLoading">登入並帶入資料 ↗</el-button>
              </el-form>
              <el-form v-else label-position="top" class="account-form" @submit.prevent="registerForQuote">
                <div class="form-grid">
                  <el-form-item label="姓名"><el-input v-model.trim="authForm.name" autocomplete="name" /></el-form-item>
                  <el-form-item label="電話（選填）"><el-input v-model.trim="authForm.phone" autocomplete="tel" /></el-form-item>
                </div>
                <el-form-item label="電子郵件"><el-input v-model.trim="authForm.email" type="email" autocomplete="email" /></el-form-item>
                <el-form-item label="設定密碼">
                  <el-input v-model="authForm.password" type="password" autocomplete="new-password" show-password placeholder="至少 8 碼" />
                </el-form-item>
                <el-button type="primary" native-type="submit" :loading="authLoading">建立帳號並帶入資料 ↗</el-button>
              </el-form>
            </section>
            <dl v-if="customer" class="generated-project">
              <dt>案件名稱將自動產生</dt>
              <dd>{{ generatedProjectPreview }}</dd>
              <small>送出時由系統編入當日的實際模型序號，多檔模型會連續編號。</small>
            </dl>
          </section>

          <section v-show="step === 3" class="step-content">
            <h2>列印設定</h2>
            <el-form label-position="top" :model="form" class="settings-form">
              <div class="form-grid">
                <el-form-item label="希望完成日期">
                  <el-date-picker v-model="form.dueDate" type="date" value-format="YYYY-MM-DD" style="width: 100%" />
                </el-form-item>
              </div>
              <el-divider>{{ form.hasModel ? '列印品質設定' : '案件預設' }}</el-divider>
              <el-alert
                v-if="form.hasModel"
                type="info"
                :closable="false"
                show-icon
                title="材料、顏色與數量已在前一步按零件設定，此處不再重複詢問。"
              />
              <div class="form-grid">
                <el-form-item v-if="!form.hasModel" label="材料">
                  <el-select v-model="form.defaults.material" style="width: 100%">
                    <el-option v-for="item in materials" :key="item" :label="materialLabel(item)" :value="item" />
                  </el-select>
                </el-form-item>
                <el-form-item v-if="!form.hasModel" label="顏色">
                  <el-input v-model="form.defaults.color" placeholder="例如：霧黑、白色、Pantone 色號" />
                </el-form-item>
                <el-form-item v-if="!form.hasModel" label="數量">
                  <el-input-number v-model="form.defaults.quantity" :min="1" :max="10000" style="width: 100%" />
                </el-form-item>
                <el-form-item label="品質">
                  <el-select v-model="form.defaults.quality" style="width: 100%">
                    <el-option label="草稿" value="Draft" />
                    <el-option label="標準" value="Standard" />
                    <el-option label="精細" value="Fine" />
                  </el-select>
                </el-form-item>
                <el-form-item label="填充率"><el-slider v-model="form.defaults.infill" :max="100" show-input /></el-form-item>
                <el-form-item label="壁數">
                  <el-input-number v-model="form.defaults.walls" :min="1" :max="12" style="width: 100%" />
                </el-form-item>
              </div>
              <el-form-item label="交期需求">
                <el-checkbox v-model="rushRequested">需要急件評估（系統以 48 小時級距試算費用，不保證此交期）</el-checkbox>
              </el-form-item>
              <el-form-item label="備註">
                <el-input v-model="form.notes" type="textarea" :rows="3" placeholder="例如：表面處理、組裝需求、包裝、運送方式等。" />
              </el-form-item>
            </el-form>
          </section>

          <section v-show="step === 4" class="step-content review">
            <h2>確認案件內容</h2>
            <div class="review-grid">
              <div>
                <dl>
                  <dt>案件名稱</dt>
                  <dd>{{ generatedProjectPreview }}</dd>
                  <dt>服務方式</dt>
                  <dd>{{ form.mode === 'estimate' ? '自動估價' : '專員協助' }}</dd>
                  <dt>材料／數量</dt>
                  <dd>
                    {{
                      form.hasModel
                        ? `依零件設定（${parts.length} 個檔案）`
                        : `${materialLabel(form.defaults.material)}／${form.defaults.quantity}`
                    }}
                  </dd>
                  <dt>模型</dt>
                  <dd>{{ form.hasModel ? `${fileList.length} 個檔案` : '需要建模協助' }}</dd>
                </dl>
              </div>
              <aside class="estimate-card" v-loading="estimating">
                <p>系統自動估價（初估）</p>
                <strong>NT$ {{ estimate ? estimate.total.toLocaleString() : '—' }}</strong>
                <small>系統以參考件用量試算，尚非上傳模型的實際切片價格。最終金額需確認模型、OrcaSlicer 切片與製程。</small>
                <ul v-if="estimate && estimate.lines && estimate.lines.length" class="estimate-lines">
                  <li v-for="line in estimate.lines" :key="line.key">
                    <span>{{ line.label }}</span>
                    <b>NT$ {{ Number(line.amount).toLocaleString() }}</b>
                  </li>
                </ul>
                <el-alert
                  v-if="estimate && estimate.escalations && estimate.escalations.length"
                  type="warning"
                  :closable="false"
                  show-icon
                  class="estimate-alert"
                  title="此案件建議專員確認"
                  :description="estimate.escalations.map((item) => item.message).join('；')"
                />
              </aside>
            </div>
            <el-alert
              type="info"
              :closable="false"
              show-icon
              title="客戶端只顯示最終總價；材料、工時、風險、折扣與稅額等明細由內部人員管理。"
            />
          </section>

          <div class="wizard-actions">
            <el-button v-if="step" @click="step -= 1">上一步</el-button>
            <el-button v-if="step < 4" type="primary" @click="next">下一步</el-button>
            <el-button v-else type="primary" :loading="submitting" @click="submit">建立案件</el-button>
          </div>
        </el-card>

        <el-dialog title="案件已建立" v-model="successVisible" width="460px" :close-on-click-modal="false">
          <div v-if="createdCase" class="success-dialog">
            <el-result icon="success" title="已收到你的案件" :sub-title="`${createdCase.caseNo}｜${createdCase.project}`" />
            <p>案件連結已建立。後續客服與 LINE 對話會統一在 Chatwoot 進行。</p>
            <el-input :model-value="publicCaseUrl" readonly>
              <template #append><el-button @click="copyLink">複製連結</el-button></template>
            </el-input>
          </div>
        </el-dialog>
      </section>
    </div>
  </public-shell>
</template>

<script>
  import { createPublicCase, estimateCase } from '@/api/cases'
  import { fetchCustomerMe, loginCustomer, registerCustomer } from '@/api/customerAuth'
  import PublicShell from '@/components/public/PublicShell.vue'
  import ModelViewer from '@/components/ModelViewer'
  import { fdmMaterials, getService, inquiryNotes } from '@/content/fdmServices.mjs'

  const COLOR_PALETTE = ['#f5f5f0', '#1c1c1c', '#d64545', '#3b6fd6', '#3f9142', '#e0b400', '#e07b28', '#8752c9']

  const emptyForm = () => ({
    mode: 'estimate',
    source: 'website',
    hasModel: true,
    customer: { name: '', email: '', phone: '', company: '' },
    project: '',
    purpose: '',
    criticalDimensions: '',
    dueDate: '',
    budget: 0,
    notes: '',
    defaults: {
      material: 'PLA',
      color: '白色',
      quantity: 1,
      quality: 'Standard',
      layerHeight: '',
      infill: 15,
      walls: 2,
      support: 'Auto',
      postProcessing: [],
    },
  })

  export default {
    name: 'QuoteWizard',
    components: { ModelViewer, PublicShell },
    data() {
      return {
        step: getService(this.$route.query.service) ? 1 : 0,
        inquiryService: getService(this.$route.query.service),
        rushRequested: this.$route.query.service === 'rush-print',
        form: {
          ...emptyForm(),
          mode: this.$route.query.mode === 'agent' ? 'agent' : 'estimate',
          hasModel: this.$route.query.model !== 'no',
          notes: inquiryNotes(this.$route.query.service),
        },
        materials: fdmMaterials,
        palette: COLOR_PALETTE,
        fileList: [],
        attachmentList: [],
        parts: [],
        previewIndex: 0,
        previewError: '',
        estimate: null,
        estimating: false,
        submitting: false,
        createdCase: null,
        accessToken: '',
        successVisible: false,
        authMode: 'login',
        authLoading: false,
        authForm: { name: '', email: '', phone: '', password: '' },
      }
    },
    computed: {
      publicCaseUrl() {
        if (!this.createdCase || !this.accessToken) return ''
        const href = this.$router.resolve({ path: `/customer/cases/${this.createdCase.id}`, query: { token: this.accessToken } }).href
        return new URL(href, window.location.href).href
      },
      previewFile() {
        const item = this.fileList[this.previewIndex] || this.fileList[0]
        return item ? item.raw || item : null
      },
      previewName() {
        const item = this.fileList[this.previewIndex] || this.fileList[0]
        return item ? item.name : ''
      },
      previewPartColors() {
        const part = this.parts[this.previewIndex]
        return part?.colorHex ? [part.colorHex] : []
      },
      customer() {
        return this.$store.getters['customerAuth/customer']
      },
      generatedProjectPreview() {
        const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
          .formatToParts(new Date())
          .filter((part) => ['year', 'month', 'day'].includes(part.type))
          .map((part) => part.value)
          .join('')
        const name = this.customer?.name || '會員'
        return `${date}・${name}・${this.form.hasModel ? '模型' : '需求'}序號`
      },
    },
    watch: {
      previewIndex() {
        this.previewError = ''
      },
    },
    async created() {
      if (this.$store.getters['customerAuth/accessToken'] && !this.customer) {
        try {
          const result = await fetchCustomerMe()
          this.$store.commit('customerAuth/setCustomer', result.customer)
          this.applyCustomer(result.customer)
        } catch {
          // customerRequest 會清除失效登入態並顯示訊息。
        }
      } else if (this.customer) {
        this.applyCustomer(this.customer)
      }
    },
    methods: {
      applyCustomer(customer) {
        this.form.customer = {
          id: customer.id || '',
          name: customer.name || '',
          email: customer.email || '',
          phone: customer.phone || '',
          company: customer.company || '',
        }
      },
      async loginForQuote() {
        if (this.authLoading) return
        if (!this.authForm.email || !this.authForm.password) return this.$baseMessage('請輸入電子郵件與密碼。', 'warning')
        this.authLoading = true
        try {
          const result = await loginCustomer(this.authForm, { skipCustomerAuthRedirect: true })
          await this.$store.dispatch('customerAuth/setSession', result)
          this.applyCustomer(result.customer)
          this.$baseMessage('已帶入你的會員資料。', 'success')
        } catch {
          // customerRequest 已顯示錯誤訊息。
        } finally {
          this.authLoading = false
        }
      },
      async registerForQuote() {
        if (this.authLoading) return
        if (!this.authForm.name || !this.authForm.email || this.authForm.password.length < 8)
          return this.$baseMessage('請填寫姓名、電子郵件，密碼至少 8 碼。', 'warning')
        this.authLoading = true
        try {
          const result = await registerCustomer(this.authForm)
          await this.$store.dispatch('customerAuth/setSession', result)
          this.applyCustomer(result.customer)
          this.$baseMessage('帳號已建立，已帶入你的資料。', 'success')
        } catch {
          // customerRequest 已顯示錯誤訊息。
        } finally {
          this.authLoading = false
        }
      },
      switchAccount() {
        this.$store.dispatch('customerAuth/resetAccessToken')
        this.form.customer = { name: '', email: '', phone: '', company: '' }
        this.authForm.password = ''
      },
      materialLabel(value) {
        return { Resin: '樹脂', Nylon: '尼龍' }[value] || value
      },
      validateModelFile(file) {
        const validType = /\.(stl|3mf|step|stp)$/i.test(file.name)
        const validSize = file.size <= 100 * 1024 * 1024
        if (!validType) this.$baseMessage('請上傳 STL、3MF、STEP 或 STP 模型檔。', 'error')
        if (!validSize) this.$baseMessage('每個檔案上限為 100 MB。', 'error')
        return validType && validSize
      },
      validateAttachmentFile(file) {
        const validType = /\.(png|jpe?g|webp|pdf)$/i.test(file.name)
        const validSize = file.size <= 100 * 1024 * 1024
        if (!validType) this.$baseMessage('需求附件可使用 PNG、JPG、WEBP 或 PDF。', 'error')
        if (!validSize) this.$baseMessage('每個附件上限為 100 MB。', 'error')
        return validType && validSize
      },
      onFileChange(file, files) {
        if (!this.validateModelFile(file.raw || file)) return
        this.fileList = files.filter((item) => this.validateModelFile(item.raw || item))
        this.parts = this.fileList.map(
          (item, index) =>
            this.parts[index] || {
              localId: item.uid || `${Date.now()}-${index}`,
              name: item.name.replace(/\.[^.]+$/, ''),
              material: this.form.defaults.material,
              color: '',
              colorHex: '',
              quantity: this.form.defaults.quantity,
            }
        )
        if (this.previewIndex >= this.fileList.length) this.previewIndex = 0
        this.previewError = ''
      },
      onPreviewError() {
        this.previewError = 'preview-failed'
      },
      onFileRemove(file, files) {
        this.fileList = files
        this.parts = this.parts.filter((part) => part.localId !== file.uid)
      },
      onAttachmentChange(file, files) {
        if (!this.validateAttachmentFile(file.raw || file)) return
        this.attachmentList = files.filter((item) => this.validateAttachmentFile(item.raw || item))
      },
      onAttachmentRemove(_, files) {
        this.attachmentList = files
      },
      validateStep() {
        if (this.step === 1 && this.form.hasModel && !this.fileList.length) return '請至少上傳一個模型檔案。'
        if (this.step === 1 && !this.form.hasModel && !this.form.purpose.trim()) return '請填寫用途或建模需求。'
        if (this.step === 2 && !this.customer) return '請先登入或建立帳號，才能建立案件。'
        return ''
      },
      async next() {
        const error = this.validateStep()
        if (error) return this.$baseMessage(error, 'error')
        this.step += 1
        if (this.step === 4) await this.loadEstimate()
      },
      async loadEstimate() {
        this.estimating = true
        try {
          const colorCount = new Set(this.parts.map((part) => (part.colorHex || part.color || '').toLowerCase()).filter(Boolean)).size || 1
          this.estimate = await estimateCase({
            material: this.form.defaults.material,
            quantity: this.form.defaults.quantity,
            quality: this.form.defaults.quality,
            infill: this.form.defaults.infill,
            walls: this.form.defaults.walls,
            support: this.form.defaults.support === 'Required',
            postProcessing: this.form.defaults.postProcessing,
            hasModel: this.form.hasModel,
            rush: this.rushRequested,
            colors: colorCount,
          })
        } finally {
          this.estimating = false
        }
      },
      async submit() {
        if (this.submitting) return
        const error = this.validateStep()
        if (error) return this.$baseMessage(error, 'error')
        this.submitting = true
        try {
          const payload = {
            ...this.form,
            project: this.generatedProjectPreview,
            notes: [
              this.form.notes,
              this.rushRequested ? '急件需求：以系統現行 48 小時級距初估費用，不代表已承諾交期；實際收件時間與排程須另行確認。' : '',
            ]
              .filter(Boolean)
              .join('\n'),
            parts: this.form.hasModel
              ? this.parts.map((part) => ({
                  name: part.name,
                  material: part.material,
                  color: part.colorHex || part.color || '',
                  quantity: part.quantity,
                }))
              : [],
            modeling: { sketches: [], criticalDimensions: this.form.criticalDimensions, requirements: this.form.purpose },
          }
          const files = [...this.fileList, ...this.attachmentList].map((item) => item.raw || item)
          const result = await createPublicCase(payload, files)
          this.createdCase = result.case
          this.accessToken = result.accessToken
          this.successVisible = true
        } finally {
          this.submitting = false
        }
      },
      async copyLink() {
        await navigator.clipboard.writeText(this.publicCaseUrl)
        this.$baseMessage('案件連結已複製。', 'success')
      },
    },
  }
</script>

<style lang="scss" scoped>
  .quote-page {
    background: #f6f5ed;
    color: #173c43;
    padding-top: 12px;
  }
  .quote-context {
    max-width: 980px;
    margin: 0 auto 20px;
    padding: 18px 24px;
    border: 1px solid #9ab6a7;
    background: #eef0dd;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 20px;
  }
  .quote-context p {
    font-size: 12px;
    margin: 6px 0 0;
    line-height: 1.8;
  }
  .quote-context a {
    flex-shrink: 0;
    font-size: 12px;
    text-decoration: underline;
  }
  @media (max-width: 1040px) {
    .quote-context {
      margin-inline: 28px;
    }
  }
  @media (max-width: 680px) {
    .quote-context {
      margin-inline: 20px;
      display: block;
    }
    .quote-context a {
      display: inline-block;
      margin-top: 10px;
    }
  }
  .settings-form :deep(.el-checkbox) {
    height: auto;
    white-space: normal;
  }
  .settings-form :deep(.el-checkbox__label) {
    white-space: normal;
    line-height: 1.7;
  }
  .quote-intro {
    max-width: 980px;
    margin: 0 auto 35px;
    padding: 25px 38px;
    border-radius: 7px;
    background: #d5e6df;
    display: grid;
    grid-template-columns: 1fr 240px;
    align-items: center;
  }
  .quote-intro h1 {
    font-size: 36px;
    margin: 14px 0;
    line-height: 1.3;
    letter-spacing: -0.035em;
  }
  .quote-intro p:not(.studio-kicker) {
    font-size: 14px;
    line-height: 1.8;
  }
  .quote-intro-note {
    font-size: 11px;
    display: inline-block;
    padding-top: 7px;
  }
  .quote-intro .object-collage {
    min-height: 220px;
  }
  .subtle {
    color: #66756f;
    line-height: 1.7;
    font-size: 13px;
  }
  .member-summary,
  .account-choice,
  .generated-project {
    max-width: 680px;
    border: 1px solid #b8cec1;
    border-radius: 8px;
    background: #fffefa;
    padding: 22px;
  }
  .member-summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 20px;
  }
  .member-summary h3 {
    margin: 4px 0;
  }
  .member-summary p:not(.studio-kicker) {
    margin: 0;
    color: #66756f;
    font-size: 14px;
  }
  .account-tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 22px;
  }
  .account-tabs button {
    border: 1px solid #b8cec1;
    background: transparent;
    border-radius: 999px;
    padding: 8px 15px;
    color: #173c43;
    cursor: pointer;
  }
  .account-tabs button.active {
    background: #173c43;
    border-color: #173c43;
    color: #fff;
  }
  .account-form {
    max-width: 560px;
  }
  .generated-project {
    margin-top: 18px;
    background: #eef4e6;
  }
  .generated-project dt {
    font-size: 12px;
    color: #557067;
  }
  .generated-project dd {
    margin: 5px 0;
    font-weight: 800;
    letter-spacing: 0.02em;
  }
  .generated-project small {
    color: #66756f;
    line-height: 1.6;
  }
  .quote-shell {
    max-width: 980px;
    margin: auto;
    padding: 0 0 65px;
  }
  .wizard-card {
    margin-top: 30px;
    border: 1px solid #d2d9ce;
    border-radius: 7px;
    background: #fffefa;
  }
  .step-content {
    min-height: 390px;
    padding: 18px 8px;
  }
  h2 {
    font-size: 24px;
    margin: 4px 0 18px;
  }
  h3 {
    margin: 24px 0 4px;
  }
  .mode-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 18px;
    margin: 26px 0;
  }
  .mode-card {
    min-height: 150px;
    border: 1px solid #c6d3ca;
    border-radius: 6px;
    background: #fffefa;
    padding: 24px;
    text-align: left;
    cursor: pointer;
    transition: 0.2s;
  }
  .mode-card:hover,
  .mode-card.selected {
    border-color: #247f93;
    background: #eaf3f4;
    box-shadow: 0 0 0 1px #247f93;
  }
  .mode-card i {
    color: #247f93;
    font-size: 25px;
    display: block;
    margin-bottom: 16px;
  }
  .mode-card b,
  .mode-card span {
    display: block;
  }
  .mode-card span {
    margin-top: 7px;
    color: #667085;
    font-size: 14px;
  }
  .choice-form {
    max-width: 600px;
  }
  .part-row {
    display: grid;
    grid-template-columns: 1.3fr 0.9fr 1.5fr 90px;
    gap: 10px;
    align-items: center;
    margin-top: 8px;
  }
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 18px;
  }
  .review-grid {
    display: grid;
    grid-template-columns: 1fr 310px;
    gap: 28px;
    margin-bottom: 24px;
  }
  dl {
    margin: 0;
  }
  dt {
    color: #667085;
    margin-top: 14px;
  }
  dd {
    margin: 3px 0;
    font-weight: 600;
  }
  .estimate-card {
    background: #173c43;
    color: #fff;
    border-radius: 14px;
    padding: 24px;
  }
  .estimate-card p {
    margin: 0;
    opacity: 0.72;
  }
  .estimate-card strong {
    display: block;
    font-size: 31px;
    margin: 10px 0;
  }
  .estimate-card small {
    line-height: 1.6;
    opacity: 0.72;
  }
  .estimate-lines {
    list-style: none;
    margin: 14px 0 0;
    padding: 12px 0 0;
    border-top: 1px solid rgba(255, 255, 255, 0.16);
  }
  .estimate-lines li {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 13px;
    padding: 3px 0;
    opacity: 0.88;
  }
  .estimate-lines li b {
    font-weight: 600;
    white-space: nowrap;
  }
  .estimate-alert {
    margin-top: 14px;
  }
  .model-preview-block {
    margin-top: 18px;
    border: 1px solid #c6d3ca;
    border-radius: 12px;
    padding: 14px;
    background: #fff;
  }
  .preview-switch {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }
  .preview-tab {
    border: 1px solid #c6d3ca;
    background: #f8fafc;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
    cursor: pointer;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .preview-tab.active {
    border-color: #247f93;
    color: #247f93;
    background: #eaf3f4;
  }
  .color-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .wizard-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 20px;
    border-top: 1px solid #edf0f5;
  }
  .success-dialog {
    text-align: center;
  }
  .success-dialog p {
    color: #667085;
    line-height: 1.7;
  }
  :deep(.el-card__body) {
    padding: 28px;
  }
  :deep(.el-step__title) {
    font-size: 13px;
  }
  :deep(.el-input-number) {
    max-width: 100%;
  }
  .quote-shell :deep(.el-input__wrapper) {
    min-height: 40px;
  }
  @media (max-width: 1040px) {
    .quote-intro,
    .quote-shell {
      margin-left: 28px;
      margin-right: 28px;
    }
  }
  @media (max-width: 680px) {
    .quote-intro,
    .quote-shell {
      margin-left: 20px;
      margin-right: 20px;
    }
    .quote-intro {
      padding: 24px;
      grid-template-columns: 1fr;
      position: relative;
      overflow: hidden;
    }
    .quote-intro > div {
      position: relative;
      z-index: 1;
    }
    .quote-intro h1 {
      font-size: 29px;
    }
    .quote-intro .object-collage {
      display: block;
      position: absolute;
      width: 185px;
      right: -30px;
      bottom: -32px;
      min-height: 190px;
      opacity: 0.36;
      pointer-events: none;
    }
    .quote-intro .studio-kicker {
      font-size: 10px;
    }
    :deep(.el-card__body) {
      padding: 18px 14px;
    }
    .step-content {
      padding: 8px 0 20px;
      min-height: 320px;
    }
    .mode-card {
      min-height: auto;
      padding: 20px;
    }
    .mode-card i {
      margin-bottom: 10px;
    }
    :deep(.el-step__title) {
      font-size: 11px;
    }
    :deep(.el-slider__input) {
      width: 105px;
    }
  }
  @media (max-width: 680px) {
    h1 {
      font-size: 30px;
    }
    .mode-grid,
    .form-grid,
    .review-grid {
      grid-template-columns: 1fr;
    }
    .member-summary {
      display: block;
    }
    .member-summary .el-button {
      margin-top: 14px;
    }
    .part-row {
      grid-template-columns: 1fr 1fr;
    }
  }
</style>
