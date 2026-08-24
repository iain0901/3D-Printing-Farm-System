<template>
  <div class="marketing-page">
    <header class="marketing-header">
      <span class="brand">3DSTU FarmFlow</span>
      <router-link to="/login" class="staff-link">員工登入</router-link>
      <router-link to="/portal/login" class="staff-link">客戶入口</router-link>
    </header>

    <section class="hero">
      <h1>3D 列印代印服務</h1>
      <p>選好規格，馬上看到價格；上傳單檔多零件自動偵測、支援多色列印；送出後即可用同一個帳號追蹤進度。</p>
    </section>

    <section class="steps-strip">
      <div v-for="step in steps" :key="step.title" class="step-item">
        <div class="step-icon"><el-icon><component :is="step.icon" /></el-icon></div>
        <div class="step-title">{{ step.title }}</div>
        <div class="step-desc">{{ step.desc }}</div>
      </div>
    </section>

    <section class="quote-workspace">
      <el-card shadow="never" class="form-card">
        <template #header><div>報價設定</div></template>
        <el-row :gutter="24">
          <el-col :xs="24" :sm="12">
            <el-form label-width="90px" size="small">
              <el-form-item label="姓名"><el-input v-model="form.customer" /></el-form-item>
              <el-form-item label="Email"><el-input v-model="form.email" /></el-form-item>
              <el-form-item label="專案名稱"><el-input v-model="form.project" /></el-form-item>
              <el-form-item>
                <template #label><span>材料 <field-help text="不同材料有不同硬度、耐熱性與價格。PLA 最容易列印、成本最低；PETG/ABS/ASA 較耐用耐熱；TPU 有彈性；Resin（光固化樹脂）/Nylon（SLS 尼龍）精度較高但成本較高。" /></span></template>
                <el-select v-model="form.material" style="width: 100%">
                  <el-option v-for="m in materials" :key="m" :label="m" :value="m" />
                </el-select>
              </el-form-item>
              <el-form-item>
                <template #label><span>品質 <field-help text="層高越薄（例如 0.12mm），表面越細緻、越精密，但列印時間越長、費用越高；層高越厚（例如 0.28mm）列印越快，但表面較粗糙，適合不要求外觀的功能件。" /></span></template>
                <el-select v-model="form.quality" style="width: 100%">
                  <el-option label="一般（0.28mm，較快）" value="Draft" />
                  <el-option label="標準（0.20mm）" value="Standard" />
                  <el-option label="精細（0.12mm，較慢）" value="Fine" />
                </el-select>
              </el-form-item>
              <el-form-item>
                <template #label><span>填充率 <field-help text="模型內部支撐結構的密度（0-100%）。填充率越高，成品越堅固但用料與列印時間也越多，費用越高。一般擺件裝飾件 10-20% 即可；需要承重、耐用的功能件建議 40% 以上。" /></span></template>
                <el-slider v-model="form.infill" :max="100" show-input />
              </el-form-item>
              <el-form-item>
                <template #label><span>牆數 <field-help text="模型外殼的層數（壁厚）。牆數越多，成品越堅固、越耐撞擊與磨損，但也會增加用料與列印時間。一般 2-3 層足夠日常使用，戶外或承重件建議 4 層以上。" /></span></template>
                <el-input-number v-model="form.walls" :min="1" :max="6" controls-position="right" style="width: 100%" />
              </el-form-item>
              <el-form-item>
                <template #label><span>顏色 <field-help text="整體列印顏色（單一顏色）。若上傳的檔案偵測到多個獨立零件，下方會另外出現每個零件可個別指定顏色的多色列印選項。" /></span></template>
                <el-color-picker v-model="form.color" :predefine="colorPalette" />
              </el-form-item>
            </el-form>
          </el-col>

          <el-col :xs="24" :sm="12">
            <el-form label-width="90px" size="small">
              <el-form-item>
                <template #label><span>支撐材 <field-help text="當模型有懸空結構或大角度懸垂（例如比 45 度更平的斜面）時，需要額外列印支撐材才能成功列印，完成後須手動拆除，會增加材料與工時成本。不確定的話可以先關閉，若模型結構複雜再開啟。" /></span></template>
                <el-switch v-model="form.support" />
              </el-form-item>
              <el-form-item>
                <template #label><span>後處理 <field-help text="列印完成後的額外加工，每項都會額外收費：打磨（去除層紋讓表面更平滑）、上漆（上色或保護漆）、染色（整體染色，多用於白色尼龍件）、拋光（讓表面更光亮）。可多選或都不選。" /></span></template>
                <el-checkbox-group v-model="form.postProcessing">
                  <el-checkbox label="sanding">打磨</el-checkbox>
                  <el-checkbox label="painting">上漆</el-checkbox>
                  <el-checkbox label="dyeing">染色</el-checkbox>
                  <el-checkbox label="polishing">拋光</el-checkbox>
                </el-checkbox-group>
              </el-form-item>
              <el-form-item>
                <template #label><span>數量 <field-help text="訂購數量越多，單價通常越低。達到 10 件以上自動 95 折、50 件以上 9 折、100 件以上 85 折。" /></span></template>
                <el-input-number v-model="form.quantity" :min="1" style="width: 100%" controls-position="right" />
              </el-form-item>
              <el-form-item>
                <template #label><span>急件 <field-help text="加急插單處理，優先排進生產隊列以縮短等待時間，會依報價加收約 25% 服務費。注意：這不會讓印表機印得更快，純粹是排程優先權，實際列印時間不會改變。" /></span></template>
                <el-switch v-model="form.rush" />
              </el-form-item>
              <el-form-item>
                <template #label><span>模型檔 <field-help text="選填。上傳 STL/3MF/OBJ/G-code 檔案後，系統會自動解析實際尺寸與重量，並偵測檔案內是否含有多個獨立零件（例如一次匯出多個鑰匙圈），估價也會改用真實尺寸重新計算。不上傳的話，價格是用一個中等尺寸的參考件估算。" /></span></template>
                <el-upload action="" :show-file-list="false" :before-upload="handleFileSelect" accept=".stl,.3mf,.obj,.gcode">
                  <el-button size="small" icon="Upload">{{ selectedFile ? selectedFile.name : '選擇檔案（選填）' }}</el-button>
                </el-upload>
                <div v-if="selectedFile" class="file-hint">已選擇：{{ selectedFile.name }}（{{ Math.round(selectedFile.size / 1024) }} KB）</div>
              </el-form-item>
              <el-form-item label="備註"><el-input v-model="form.notes" type="textarea" :rows="2" /></el-form-item>
            </el-form>
          </el-col>
        </el-row>

        <div v-if="selectedFile" class="model-preview-block">
          <model-viewer
            :file="selectedFile"
            :filename="selectedFile.name"
            :part-colors="partColorList"
            :height="280"
            @parts="onPartsDetected"
            @loaded="onModelLoaded"
            @error="onModelError"
          />
          <p v-if="analyzedMeta" class="hint model-meta">
            實際尺寸：{{ analyzedMeta.dimensions.join(' × ') }} mm ・ 約 {{ analyzedMeta.estimateGrams }}g ・ {{ analyzedMeta.printTime }}
          </p>
          <div v-if="viewerParts.length > 1" class="multi-color-block">
            <p class="multi-color-title">
              偵測到 <b>{{ viewerParts.length }}</b> 個獨立零件，可分別指定顏色（多色列印）
              <field-help text="現在流行的多色列印（如 Bambu AMS、Prusa MMU/XL）大多是把不同顏色的區塊拆成獨立零件，再各自指定材料顏色。這裡偵測到的每個零件都能單獨選色；3MF 檔案若本身已內嵌顏色（Bambu Studio/PrusaSlicer/Orca Slicer 匯出）會自動帶入。超過一種顏色會加收換料/清料費。" />
            </p>
            <part-color-picker :parts="viewerParts" :colors="partColorMap" @change="onColorChange" />
          </div>
        </div>

        <div v-if="submitted" class="quote-result">
          <p>已收到您的報價需求！編號：<b>{{ submitted.id }}</b></p>
          <p v-if="submitted.filePartCount > 1" class="parts-note">
            偵測到檔案內含 <b>{{ submitted.filePartCount }}</b> 個獨立零件：
          </p>
          <ul v-if="submitted.filePartCount > 1" class="parts-list">
            <li v-for="part in submitted.fileParts" :key="part.index">
              零件 {{ part.index + 1 }}：{{ part.dimensions.join(' × ') }} mm，約 {{ part.estimateGrams }}g
            </li>
          </ul>
          <p class="hint">
            前往<router-link to="/portal/register">客戶入口註冊</router-link>或<router-link to="/portal/login">登入</router-link>（使用同一個 Email：{{ form.email }}），即可查看此報價進度、後續訂單與物流狀態。
          </p>
        </div>
      </el-card>

      <el-card shadow="never" class="price-card" v-loading="pricingLoading">
        <template #header><div>即時報價</div></template>
        <div class="price-total">
          <span class="price-currency">$</span>{{ liveEstimate.total }}
        </div>
        <p class="price-material">{{ form.material }} · {{ qualityLabel }} · 數量 {{ form.quantity }}</p>
        <div class="price-breakdown">
          <p><span>材料</span><span>${{ liveEstimate.materialCost }}</span></p>
          <p><span>機時</span><span>${{ liveEstimate.machineCost }}</span></p>
          <p><span>備料損耗</span><span>${{ liveEstimate.reserve }}</span></p>
          <p><span>管銷</span><span>${{ liveEstimate.overhead }}</span></p>
          <p v-if="liveEstimate.postProcessingFee"><span>後處理</span><span>+${{ liveEstimate.postProcessingFee }}</span></p>
          <p v-if="liveEstimate.rushFee"><span>急件加成</span><span>+${{ liveEstimate.rushFee }}</span></p>
          <p v-if="liveEstimate.colorSurcharge"><span>多色加工</span><span>+${{ liveEstimate.colorSurcharge }}</span></p>
          <p v-if="liveEstimate.bulkDiscountFactor < 1"><span>量產折扣</span><span>×{{ liveEstimate.bulkDiscountFactor }}</span></p>
        </div>
        <p class="hint">參考件：約 {{ referenceInfo.grams }}g / {{ referenceInfo.minutes }} 分鐘{{ selectedFile ? '（已上傳檔案，送出後將依實際尺寸重新估價）' : '' }}</p>
        <el-button type="primary" :loading="submitting" style="width: 100%" @click="submit">送出報價需求</el-button>
        <p class="hint disclaimer">此為即時估算報價，實際報價仍以上傳檔案後系統依真實模型尺寸重新計算為準。</p>
      </el-card>
    </section>

    <section class="materials-section">
      <h2>支援材質</h2>
      <div class="materials-grid">
        <el-card v-for="item in materialInfo" :key="item.name" shadow="hover" class="material-card">
          <div class="material-name">{{ item.name }}</div>
          <div class="material-desc">{{ item.desc }}</div>
        </el-card>
      </div>
    </section>

    <section class="faq-section">
      <h2>常見問題</h2>
      <el-collapse accordion>
        <el-collapse-item v-for="item in faqs" :key="item.q" :title="item.q">
          <p>{{ item.a }}</p>
        </el-collapse-item>
      </el-collapse>
    </section>

    <footer class="marketing-footer">
      <div>3DSTU FarmFlow ・ 3D 列印代印服務</div>
      <div class="footer-links">
        <router-link to="/login">員工登入</router-link>
        <router-link to="/portal/login">客戶入口</router-link>
        <router-link to="/portal/register">註冊客戶帳號</router-link>
      </div>
      <div class="footer-copy">© {{ new Date().getFullYear() }} 3DSTU. All rights reserved.</div>
    </footer>
  </div>
</template>

<script>
  import { submitPublicQuoteRequest, fetchPricingEstimate, fetchModelPreview } from '@/api/public'
  import FieldHelp from '@/components/FieldHelp'
  import ModelViewer from '@/components/ModelViewer'
  import PartColorPicker from '@/components/PartColorPicker'

  let pricingDebounceTimer = null
  const QUALITY_LABELS = { Draft: '一般（0.28mm）', Standard: '標準（0.20mm）', Fine: '精細（0.12mm）' }
  const COLOR_PALETTE = ['#f5f5f0', '#1c1c1c', '#d64545', '#3b6fd6', '#3f9142', '#e0b400', '#e07b28', '#8752c9']

  export default {
    name: 'Marketing',
    components: { FieldHelp, ModelViewer, PartColorPicker },
    data() {
      return {
        materials: ['PLA', 'PETG', 'ABS', 'ASA', 'TPU', 'Resin', 'Nylon'],
        colorPalette: COLOR_PALETTE,
        steps: [
          { icon: 'Upload', title: '1. 上傳模型或填規格', desc: '上傳 STL/3MF/OBJ/G-code，系統自動偵測尺寸與單檔多零件；沒有檔案也能先用參數估價。' },
          { icon: 'View', title: '2. 即時看到報價', desc: '調整材料、品質、填充率、數量等參數，價格即時更新，多零件檔案可分別指定顏色。' },
          { icon: 'Tickets', title: '3. 送出並追蹤進度', desc: '送出後用同一個 Email 註冊/登入客戶入口，即可查看報價進度、留言溝通、線上結帳。' },
          { icon: 'Van', title: '4. 生產與物流追蹤', desc: '訂單確認後進入生產排程，完成後提供物流追蹤號碼查詢，並可累積會員點數折抵下次消費。' },
        ],
        materialInfo: [
          { name: 'PLA', desc: '最容易列印、成本最低，適合一般模型、擺件與原型。' },
          { name: 'PETG', desc: '耐用性與耐候性較好，適合戶外或需要一定強度的功能件。' },
          { name: 'ABS', desc: '耐熱性好、稍具彈性，適合需要後加工（如烯烴黏合、打磨）的零件。' },
          { name: 'ASA', desc: '耐候性優於 ABS，適合長期戶外曝曬的零件。' },
          { name: 'TPU', desc: '柔軟有彈性，適合防滑墊、手機殼、密封件等需要彈性的應用。' },
          { name: 'Resin', desc: '光固化樹脂，精度極高，適合精密模型、牙科/珠寶等細節要求高的場景。' },
          { name: 'Nylon', desc: 'SLS 尼龍，強度與耐磨性最好，適合功能性強、需長期使用的零件。' },
        ],
        faqs: [
          { q: '單檔案含有多個零件，系統會怎麼處理？', a: '上傳 STL 時系統會用連通分量分析自動偵測檔案內是否有多個互不相連的零件（例如一次匯出多個鑰匙圈）；3MF 檔案則直接讀取內部的物件結構。偵測到多個零件時，報價表單會列出每個零件的尺寸與重量，並可個別指定顏色。' },
          { q: '多色列印如何運作、如何加價？', a: '偵測到多個零件後，可在報價表單中分別為每個零件指定顏色（3MF 若本身已內嵌顏色會自動帶入）。每多一種顏色（超過第一種）會加收換料/清料費，反映實際換色所需的時間與材料損耗，跟 Bambu AMS、Prusa MMU/XL 等多色列印機制的實際成本邏輯一致。' },
          { q: '急件是什麼？會縮短列印時間嗎？', a: '急件是加急插單服務，讓您的訂單優先排進生產隊列，縮短的是等待排程的時間，而不是實際列印所需的時間；因此會加收約 25% 服務費，但不會改變模型本身的列印時長。' },
          { q: '有哪些付款方式？', a: '客戶入口結帳目前支援街口支付、LINE Pay、統一金流，實際可用的方式依後台設定顯示；尚未完成串接的方式會顯示「即將推出」。' },
          { q: '訂單出貨後可以追蹤物流嗎？', a: '可以，客戶入口的訂單頁面會顯示物流追蹤號碼與貨運狀態查詢（透過 Track.TW API）。' },
          { q: '有優惠券和會員點數嗎？', a: '有的，客戶入口可以套用優惠券折抵訂單金額；訂單完成後會依消費金額累積會員點數（每消費 $10 累積 1 點），點數可在下次結帳時折抵（100 點折抵 $10）。' },
        ],
        form: {
          customer: '',
          email: '',
          project: '',
          material: 'PLA',
          quality: 'Standard',
          infill: 15,
          walls: 2,
          support: false,
          postProcessing: [],
          quantity: 1,
          rush: false,
          notes: '',
          color: '#f5f5f0',
        },
        selectedFile: null,
        analyzedMeta: null,
        viewerParts: [],
        partColorMap: {},
        submitting: false,
        submitted: null,
        pricingLoading: false,
        liveEstimate: { total: 0, materialCost: 0, machineCost: 0, reserve: 0, overhead: 0, rushFee: 0, postProcessingFee: 0, colorSurcharge: 0, bulkDiscountFactor: 1 },
        referenceInfo: { grams: 0, minutes: 0 },
      }
    },
    computed: {
      qualityLabel() {
        return QUALITY_LABELS[this.form.quality] || this.form.quality
      },
      partColorList() {
        return this.viewerParts.map((part) => this.partColorMap[part.index])
      },
      distinctColorCount() {
        if (this.viewerParts.length <= 1) return 1
        const distinct = new Set(this.partColorList.filter(Boolean).map((hex) => hex.toLowerCase()))
        return Math.max(1, distinct.size)
      },
    },
    watch: {
      'form.material': 'schedulePricingRefresh',
      'form.quality': 'schedulePricingRefresh',
      'form.infill': 'schedulePricingRefresh',
      'form.walls': 'schedulePricingRefresh',
      'form.support': 'schedulePricingRefresh',
      'form.postProcessing': 'schedulePricingRefresh',
      'form.quantity': 'schedulePricingRefresh',
      'form.rush': 'schedulePricingRefresh',
      distinctColorCount: 'schedulePricingRefresh',
    },
    created() {
      this.refreshPricing()
    },
    methods: {
      handleFileSelect(file) {
        this.selectedFile = file
        this.analyzedMeta = null
        this.viewerParts = []
        this.partColorMap = {}
        return false // 阻止 el-upload 自動上傳，改由「送出報價需求」按鈕一起送出
      },
      onPartsDetected(parts) {
        this.viewerParts = parts
        const map = {}
        parts.forEach((part, index) => {
          map[part.index] = part.color ? `#${part.color}` : this.colorPalette[index % this.colorPalette.length]
        })
        this.partColorMap = map
      },
      onModelLoaded() {
        // 3D 檢視器成功載入後，改用真實檔案再打一次無狀態預覽 API 取得精準尺寸/重量/工時（比參考件估算準確）
        this.analyzeFile()
      },
      onModelError(message) {
        this.$baseMessage(`模型檔案解析失敗：${message}`, 'error')
      },
      onColorChange({ index, color }) {
        this.partColorMap = { ...this.partColorMap, [index]: color }
      },
      async analyzeFile() {
        if (!this.selectedFile) return
        try {
          const result = await fetchModelPreview(this.selectedFile, this.form.material)
          this.analyzedMeta = result.metadata
        } catch {
          // 預覽解析失敗不影響送出報價，3D 檢視器本身仍會用本機解析結果顯示模型
        }
      },
      schedulePricingRefresh() {
        clearTimeout(pricingDebounceTimer)
        pricingDebounceTimer = setTimeout(() => this.refreshPricing(), 250)
      },
      async refreshPricing() {
        this.pricingLoading = true
        try {
          const { quality, infill, walls, support, postProcessing, quantity, rush, material } = this.form
          const result = await fetchPricingEstimate({ material, quality, infill, walls, support, postProcessing, quantity, rush, colors: this.distinctColorCount })
          this.liveEstimate = result.estimate
          this.referenceInfo = result.reference
        } finally {
          this.pricingLoading = false
        }
      },
      async submit() {
        if (!this.form.customer || !this.form.email || !this.form.project) {
          this.$baseMessage('請填寫姓名、Email、專案名稱', 'warning')
          return
        }
        this.submitting = true
        try {
          const { customer, email, project, material, quality, infill, walls, support, postProcessing, quantity, rush, notes, color } = this.form
          const partColors = this.viewerParts.map((part) => ({ index: part.index, color: this.partColorMap[part.index] })).filter((item) => item.color)
          // 注意：正式報價需求的 support 欄位是描述性字串（"Auto"/"None"/...），跟即時估價用的布林開關不是同一個型別
          const result = await submitPublicQuoteRequest(
            { customer, email, project, material, quality, infill, walls, support: support ? 'Auto' : 'None', postProcessing, quantity, rush, notes, color, partColors },
            this.selectedFile
          )
          this.submitted = result.quoteRequest
          this.$baseMessage('報價需求已送出', 'success')
        } finally {
          this.submitting = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .marketing-page {
    min-height: 100vh;
    background: #f6f8f9;
  }

  .marketing-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px 24px;
    background: #fff;
    border-bottom: 1px solid $base-border-color;

    .brand {
      font-weight: 700;
      font-size: 18px;
      margin-right: auto;
    }

    .staff-link {
      font-size: 13px;
      color: $base-color-blue;
    }
  }

  .hero {
    text-align: center;
    padding: 48px 24px;

    h1 {
      margin: 0 0 8px;
    }

    p {
      color: $base-color-gray;
    }
  }

  .quote-workspace {
    display: flex;
    gap: 20px;
    flex-wrap: wrap;
    justify-content: center;
    padding: 0 24px 48px;
    align-items: flex-start;
  }

  .form-card {
    width: 680px;
    max-width: 100%;
  }

  .price-card {
    width: 300px;
    position: sticky;
    top: 20px;
  }

  .price-total {
    font-size: 40px;
    font-weight: 700;
    color: $base-color-blue;
    line-height: 1.1;
  }

  .price-currency {
    font-size: 20px;
    margin-right: 2px;
  }

  .price-material {
    color: $base-color-gray;
    font-size: 13px;
    margin: 4px 0 12px;
  }

  .price-breakdown {
    border-top: 1px dashed $base-border-color;
    padding-top: 8px;
    margin-bottom: 12px;

    p {
      display: flex;
      justify-content: space-between;
      margin: 4px 0;
      font-size: 13px;
      color: $base-color-gray;
    }
  }

  .quote-result {
    margin-top: 16px;
    font-size: 13px;
    border-top: 1px dashed $base-border-color;
    padding-top: 12px;

    code {
      word-break: break-all;
      font-size: 12px;
    }
  }

  .parts-note {
    font-weight: 600;
  }

  .parts-list {
    margin: 4px 0 8px;
    padding-left: 18px;
  }

  .file-hint {
    font-size: 12px;
    color: $base-color-gray;
    margin-top: 4px;
  }

  .model-preview-block {
    margin-top: 16px;
    border-top: 1px dashed $base-border-color;
    padding-top: 16px;
  }

  .model-meta {
    margin-top: 6px;
  }

  .multi-color-block {
    margin-top: 14px;
    padding: 12px;
    background: #f9fafb;
    border-radius: 4px;
  }

  .multi-color-title {
    font-size: 13px;
    margin: 0 0 10px;
  }

  .hint {
    color: $base-color-gray;
    font-size: 12px;
  }

  .disclaimer {
    margin-top: 10px;
  }

  .steps-strip {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 16px;
    padding: 0 24px 40px;
    max-width: 1080px;
    margin: 0 auto;
  }

  .step-item {
    flex: 1;
    min-width: 200px;
    max-width: 250px;
    text-align: center;
    background: #fff;
    border-radius: 6px;
    padding: 20px 14px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  .step-icon {
    font-size: 26px;
    color: $base-color-blue;
    margin-bottom: 8px;
  }

  .step-title {
    font-weight: 600;
    margin-bottom: 6px;
  }

  .step-desc {
    font-size: 12px;
    color: $base-color-gray;
    line-height: 1.5;
  }

  .materials-section,
  .faq-section {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 24px 48px;

    h2 {
      text-align: center;
      margin-bottom: 20px;
    }
  }

  .materials-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 14px;
  }

  .material-card {
    .material-name {
      font-weight: 700;
      margin-bottom: 6px;
    }

    .material-desc {
      font-size: 12px;
      color: $base-color-gray;
      line-height: 1.5;
    }
  }

  .marketing-footer {
    text-align: center;
    padding: 24px;
    border-top: 1px solid $base-border-color;
    color: $base-color-gray;
    font-size: 13px;

    .footer-links {
      display: flex;
      justify-content: center;
      gap: 16px;
      margin: 8px 0;

      a {
        color: $base-color-blue;
      }
    }

    .footer-copy {
      font-size: 12px;
    }
  }
</style>
