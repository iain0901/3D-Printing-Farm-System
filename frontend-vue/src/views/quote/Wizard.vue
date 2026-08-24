<template>
  <main class="quote-page">
    <header class="quote-header">
      <router-link class="brand" to="/">3DRFM <span>製造服務</span></router-link>
      <div class="header-links">
        <router-link to="/portal/login">會員中心</router-link>
        <router-link to="/login">內部登入</router-link>
      </div>
    </header>

    <section class="hero">
      <p class="eyebrow">3D 列印、建模與小量製造</p>
      <h1>建立你的列印案件</h1>
      <p>快速估價或由專員協助都會進入同一張案件，全程可追蹤。</p>
    </section>

    <section class="quote-shell">
      <el-steps :active="step" finish-status="success" align-center>
        <el-step title="服務方式" />
        <el-step title="模型或需求" />
        <el-step title="列印設定" />
        <el-step title="確認送出" />
      </el-steps>

      <el-card shadow="never" class="wizard-card">
        <section v-show="step === 0" class="step-content">
          <h2>你想怎麼開始？</h2>
          <div class="mode-grid">
            <button class="mode-card" :class="{ selected: form.mode === 'estimate' }" @click="form.mode = 'estimate'">
              <el-icon><DataAnalysis /></el-icon>
              <b>快速估價</b>
              <span>先輸入條件並取得初步總價</span>
            </button>
            <button class="mode-card" :class="{ selected: form.mode === 'agent' }" @click="form.mode = 'agent'">
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
              <div class="el-upload__text">拖曳模型至此，或 <em>選擇檔案</em></div>
            </el-upload>
            <el-alert v-if="fileList.length" type="success" :closable="false" show-icon title="檔案會以私有儲存方式處理；解析異常時保留案件並交由專員檢查。" />
            <div v-if="fileList.length" class="model-preview-block">
              <model-viewer :file="previewFile" :filename="previewName" :height="260" @error="onPreviewError" />
              <div v-if="fileList.length > 1" class="preview-switch">
                <button
                  v-for="(item, index) in fileList"
                  :key="item.uid"
                  type="button"
                  class="preview-tab"
                  :class="{ active: index === previewIndex }"
                  @click="previewIndex = index"
                >{{ item.name }}</button>
              </div>
              <p v-if="previewError" class="subtle">此格式無法在瀏覽器預覽（STEP 等），仍可正常送出，由專員轉檔處理。</p>
            </div>
            <div v-if="parts.length" class="part-list">
              <h3>零件設定</h3>
              <p class="subtle">系統先以案件預設套用；可直接覆寫各零件的材料、顏色與數量。</p>
              <div v-for="part in parts" :key="part.localId" class="part-row">
                <el-input v-model="part.name" size="small" />
                <el-select v-model="part.material" size="small"><el-option v-for="item in materials" :key="item" :label="item" :value="item" /></el-select>
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
                <el-input v-model="form.purpose" type="textarea" :rows="4" placeholder="例如：依照電路板尺寸製作可鎖牆的外殼、需要防水與走線孔。" />
              </el-form-item>
              <el-form-item label="關鍵尺寸、草圖或照片">
                <el-input v-model="form.criticalDimensions" type="textarea" :rows="3" placeholder="可填寫長寬高、孔位、配合物尺寸；照片與草圖可在送出後由 Chatwoot 對話補件。" />
              </el-form-item>
              <el-form-item label="草圖、照片或需求 PDF">
                <el-upload action="" :auto-upload="false" multiple :file-list="attachmentList" :on-change="onAttachmentChange" :on-remove="onAttachmentRemove" :before-upload="validateAttachmentFile" accept=".png,.jpg,.jpeg,.webp,.pdf">
                  <el-button size="small" icon="Paperclip">選擇附件</el-button>
                  <template #tip><span class="el-upload__tip">每個附件上限 100 MB。</span></template>
                </el-upload>
              </el-form-item>
            </el-form>
          </template>
        </section>

        <section v-show="step === 2" class="step-content">
          <h2>列印與聯絡設定</h2>
          <el-form label-position="top" :model="form" class="settings-form">
            <div class="form-grid">
              <el-form-item label="姓名" required><el-input v-model="form.customer.name" /></el-form-item>
              <el-form-item label="Email"><el-input v-model="form.customer.email" /></el-form-item>
              <el-form-item label="手機"><el-input v-model="form.customer.phone" /></el-form-item>
              <el-form-item label="公司／工作室"><el-input v-model="form.customer.company" /></el-form-item>
              <el-form-item label="案件名稱" required><el-input v-model="form.project" /></el-form-item>
              <el-form-item label="希望完成日期"><el-date-picker v-model="form.dueDate" type="date" value-format="yyyy-MM-dd" style="width: 100%" /></el-form-item>
            </div>
            <el-divider>案件預設</el-divider>
            <div class="form-grid">
              <el-form-item label="材料"><el-select v-model="form.defaults.material" style="width: 100%"><el-option v-for="item in materials" :key="item" :label="item" :value="item" /></el-select></el-form-item>
              <el-form-item label="顏色"><el-input v-model="form.defaults.color" placeholder="例如：霧黑、白色、Pantone 色號" /></el-form-item>
              <el-form-item label="數量"><el-input-number v-model="form.defaults.quantity" :min="1" :max="10000" style="width: 100%" /></el-form-item>
              <el-form-item label="品質"><el-select v-model="form.defaults.quality" style="width: 100%"><el-option label="草稿" value="Draft" /><el-option label="標準" value="Standard" /><el-option label="精細" value="Fine" /></el-select></el-form-item>
              <el-form-item label="填充率"><el-slider v-model="form.defaults.infill" :max="100" show-input /></el-form-item>
              <el-form-item label="壁數"><el-input-number v-model="form.defaults.walls" :min="1" :max="12" style="width: 100%" /></el-form-item>
            </div>
            <el-form-item label="備註"><el-input v-model="form.notes" type="textarea" :rows="3" placeholder="例如：表面處理、組裝需求、包裝、運送方式等。" /></el-form-item>
          </el-form>
        </section>

        <section v-show="step === 3" class="step-content review">
          <h2>確認案件內容</h2>
          <div class="review-grid">
            <div>
              <dl>
                <dt>案件名稱</dt><dd>{{ form.project || '尚未填寫' }}</dd>
                <dt>服務方式</dt><dd>{{ form.mode === 'estimate' ? '快速估價' : '專員協助' }}</dd>
                <dt>材料／數量</dt><dd>{{ form.defaults.material }}／{{ form.defaults.quantity }}</dd>
                <dt>模型</dt><dd>{{ form.hasModel ? `${fileList.length} 個檔案` : '需要建模協助' }}</dd>
              </dl>
            </div>
            <aside class="estimate-card" v-loading="estimating">
              <p>初步預估總價</p>
              <strong>NT$ {{ estimate ? estimate.total.toLocaleString() : '—' }}</strong>
              <small>最終金額由專員確認模型、OrcaSlicer 切片與製程後提供。</small>
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
          <el-alert type="info" :closable="false" show-icon title="客戶端只顯示最終總價；材料、工時、風險、折扣與稅額等明細由內部人員管理。" />
        </section>

        <div class="wizard-actions">
          <el-button v-if="step" @click="step -= 1">上一步</el-button>
          <el-button v-if="step < 3" type="primary" @click="next">下一步</el-button>
          <el-button v-else type="primary" :loading="submitting" @click="submit">建立案件</el-button>
        </div>
      </el-card>

      <el-dialog title="案件已建立" v-model="successVisible" width="460px" :close-on-click-modal="false">
        <div v-if="createdCase" class="success-dialog">
          <el-result icon="success" title="已收到你的案件" :sub-title="`${createdCase.caseNo}｜${createdCase.project}`" />
          <p>案件連結已建立。後續客服與 LINE 對話會統一在 Chatwoot 進行。</p>
          <el-input :value="publicCaseUrl" readonly><template #append><el-button @click="copyLink">複製連結</el-button></template></el-input>
        </div>
      </el-dialog>
    </section>
  </main>
</template>

<script>
  import { createPublicCase, estimateCase } from '@/api/cases'
  import ModelViewer from '@/components/ModelViewer'

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
    defaults: { material: 'PLA', color: '白色', quantity: 1, quality: 'Standard', layerHeight: '', infill: 15, walls: 2, support: 'Auto', postProcessing: [] },
  })

  export default {
    name: 'QuoteWizard',
    components: { ModelViewer },
    data() {
      return {
        step: 0,
        form: emptyForm(),
        materials: ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Resin', 'Nylon'],
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
      }
    },
    computed: {
      publicCaseUrl() {
        if (!this.createdCase || !this.accessToken) return ''
        return `${window.location.origin}/customer/cases/${this.createdCase.id}?token=${encodeURIComponent(this.accessToken)}`
      },
      previewFile() {
        const item = this.fileList[this.previewIndex] || this.fileList[0]
        return item ? item.raw || item : null
      },
      previewName() {
        const item = this.fileList[this.previewIndex] || this.fileList[0]
        return item ? item.name : ''
      },
    },
    watch: {
      previewIndex() {
        this.previewError = ''
      },
    },
    methods: {
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
        this.parts = this.fileList.map((item, index) => this.parts[index] || ({
          localId: item.uid || `${Date.now()}-${index}`,
          name: item.name.replace(/\.[^.]+$/, ''),
          material: this.form.defaults.material,
          color: '',
          colorHex: '',
          quantity: this.form.defaults.quantity,
        }))
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
      onAttachmentRemove(_, files) { this.attachmentList = files },
      validateStep() {
        if (this.step === 1 && this.form.hasModel && !this.fileList.length) return '請至少上傳一個模型檔案。'
        if (this.step === 1 && !this.form.hasModel && !this.form.purpose.trim()) return '請填寫用途或建模需求。'
        if (this.step === 2) {
          if (!this.form.customer.name.trim() || !this.form.project.trim()) return '請填寫姓名與案件名稱。'
          if (this.form.customer.email && !/^\S+@\S+\.\S+$/.test(this.form.customer.email)) return 'Email 格式需要確認。'
        }
        return ''
      },
      async next() {
        const error = this.validateStep()
        if (error) return this.$baseMessage(error, 'error')
        this.step += 1
        if (this.step === 3) await this.loadEstimate()
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
            rush: false,
            colors: colorCount,
          })
        } finally {
          this.estimating = false
        }
      },
      async submit() {
        const error = this.validateStep()
        if (error) return this.$baseMessage(error, 'error')
        this.submitting = true
        try {
          const payload = {
            ...this.form,
            parts: this.form.hasModel ? this.parts.map((part) => ({
              name: part.name,
              material: part.material,
              color: part.colorHex || part.color || '',
              quantity: part.quantity,
            })) : [],
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
  .quote-page { min-height: 100vh; background: #f5f7fb; color: #17223b; }
  .quote-header { max-width: 1160px; margin: auto; padding: 22px 24px; display: flex; justify-content: space-between; align-items: center; }
  .brand { color: #17223b; font-size: 22px; font-weight: 800; text-decoration: none; letter-spacing: .4px; }
  .brand span { font-size: 13px; color: #6b7280; font-weight: 500; margin-left: 7px; }
  .header-links a { margin-left: 20px; color: #4b5563; text-decoration: none; font-size: 14px; }
  .hero { max-width: 860px; margin: 24px auto 34px; text-align: center; padding: 0 24px; }
  .eyebrow { color: #3563e9; font-weight: 700; font-size: 13px; letter-spacing: 1px; }
  h1 { margin: 8px 0 12px; font-size: 38px; }
  .hero p:last-child, .subtle { color: #667085; line-height: 1.7; }
  .quote-shell { max-width: 980px; margin: auto; padding: 0 24px 60px; }
  .wizard-card { margin-top: 30px; border: 0; border-radius: 16px; }
  .step-content { min-height: 390px; padding: 18px 8px; }
  h2 { font-size: 24px; margin: 4px 0 18px; }
  h3 { margin: 24px 0 4px; }
  .mode-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 18px; margin: 26px 0; }
  .mode-card { min-height: 150px; border: 1px solid #dbe2ef; border-radius: 12px; background: #fff; padding: 24px; text-align: left; cursor: pointer; transition: .2s; }
  .mode-card:hover, .mode-card.selected { border-color: #3563e9; box-shadow: 0 8px 24px rgba(53,99,233,.12); }
  .mode-card i { color: #3563e9; font-size: 25px; display: block; margin-bottom: 16px; }
  .mode-card b, .mode-card span { display: block; }
  .mode-card span { margin-top: 7px; color: #667085; font-size: 14px; }
  .choice-form { max-width: 600px; }
  .part-row { display: grid; grid-template-columns: 1.3fr .9fr 1.5fr 90px; gap: 10px; align-items: center; margin-top: 8px; }
  .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; }
  .review-grid { display: grid; grid-template-columns: 1fr 310px; gap: 28px; margin-bottom: 24px; }
  dl { margin: 0; } dt { color: #667085; margin-top: 14px; } dd { margin: 3px 0; font-weight: 600; }
  .estimate-card { background: #17223b; color: #fff; border-radius: 14px; padding: 24px; }
  .estimate-card p { margin: 0; opacity: .72; } .estimate-card strong { display: block; font-size: 31px; margin: 10px 0; } .estimate-card small { line-height: 1.6; opacity: .72; }
  .estimate-lines { list-style: none; margin: 14px 0 0; padding: 12px 0 0; border-top: 1px solid rgba(255,255,255,.16); }
  .estimate-lines li { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; padding: 3px 0; opacity: .88; }
  .estimate-lines li b { font-weight: 600; white-space: nowrap; }
  .estimate-alert { margin-top: 14px; }
  .model-preview-block { margin-top: 18px; border: 1px solid #dbe2ef; border-radius: 12px; padding: 14px; background: #fff; }
  .preview-switch { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .preview-tab { border: 1px solid #dbe2ef; background: #f8fafc; border-radius: 8px; padding: 5px 10px; font-size: 12px; cursor: pointer; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preview-tab.active { border-color: #3563e9; color: #3563e9; background: #eef3ff; }
  .color-cell { display: flex; align-items: center; gap: 8px; }
  .wizard-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 20px; border-top: 1px solid #edf0f5; }
  .success-dialog { text-align: center; } .success-dialog p { color: #667085; line-height: 1.7; }
  @media (max-width: 680px) { h1 { font-size: 30px; } .mode-grid, .form-grid, .review-grid { grid-template-columns: 1fr; } .part-row { grid-template-columns: 1fr 1fr; } }
</style>
