<template>
  <div class="case-workbench">
    <vab-page-header title="3DRFM 案件中心" content="客戶案件、報價版本、付款與生產準備都在同一個工作流程內。" />
    <el-card shadow="never">
      <div class="toolbar">
        <el-input v-model="query.search" clearable placeholder="搜尋案件編號、客戶、Email 或案件名稱" prefix-icon="el-icon-search" @keyup.enter.native="load" />
        <el-select v-model="query.status" clearable placeholder="全部狀態" @change="load"><el-option v-for="item in statuses" :key="item.value" :label="item.label" :value="item.value" /></el-select>
        <el-button type="primary" icon="el-icon-refresh" @click="load">更新</el-button>
      </div>
      <el-table v-loading="loading" :data="cases" row-key="id" @row-click="openCase">
        <el-table-column label="案件" min-width="185"><template slot-scope="{ row }"><b>{{ row.caseNo }}</b><div class="muted">{{ row.project }}</div></template></el-table-column>
        <el-table-column label="客戶" min-width="150"><template slot-scope="{ row }">{{ row.customerSnapshot.name }}<div class="muted">{{ row.customerSnapshot.email }}</div></template></el-table-column>
        <el-table-column label="狀態" width="150"><template slot-scope="{ row }"><el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="報價總額" width="130"><template slot-scope="{ row }">{{ row.quotedValue ? `NT$ ${Number(row.quotedValue).toLocaleString()}` : '—' }}</template></el-table-column>
        <el-table-column label="付款" width="110"><template slot-scope="{ row }">{{ paymentLabel(row.paymentStatus) }}</template></el-table-column>
        <el-table-column label="更新時間" width="170"><template slot-scope="{ row }">{{ formatDate(row.updatedAt) }}</template></el-table-column>
      </el-table>
    </el-card>

    <el-drawer :visible.sync="drawerVisible" size="700px" :with-header="false" @closed="selected = null">
      <div v-if="selected" class="drawer-content">
        <div class="drawer-head">
          <div><p class="muted">{{ selected.caseNo }}</p><h2>{{ selected.project }}</h2><p>{{ selected.customerSnapshot.name }} · {{ selected.customerSnapshot.phone || selected.customerSnapshot.email }}</p></div>
          <el-tag :type="statusType(selected.status)">{{ statusLabel(selected.status) }}</el-tag>
        </div>
        <el-alert v-if="selected.technicalReviewRequired" type="warning" :closable="false" show-icon title="此案件有檔案解析或尺寸異常，需由專員確認。" :description="selected.technicalReviewReasons.join('；')" />
        <el-steps :active="workflowIndex(selected.status)" finish-status="success" simple class="case-steps"><el-step title="審核" /><el-step title="報價" /><el-step title="付款" /><el-step title="生產" /><el-step title="交付" /></el-steps>

        <el-tabs v-model="drawerTab">
          <el-tab-pane label="案件內容" name="overview">
            <div class="detail-grid"><div><span>服務方式</span><b>{{ selected.mode === 'estimate' ? '快速估價' : '專員協助' }}</b></div><div><span>來源</span><b>{{ selected.source }}</b></div><div><span>希望日期</span><b>{{ selected.dueDate || '未指定' }}</b></div><div><span>預算</span><b>NT$ {{ selected.budget || 0 }}</b></div></div>
            <h3>零件</h3>
            <el-table :data="selected.parts" size="mini"><el-table-column prop="name" label="零件" /><el-table-column prop="material" label="材料" /><el-table-column prop="color" label="顏色" /><el-table-column prop="quantity" label="數量" width="70" /><el-table-column prop="readiness" label="準備" width="100" /></el-table>
            <h3>內部備註</h3><p class="notes">{{ selected.notes || '—' }}</p>
          </el-tab-pane>
          <el-tab-pane label="報價版本" name="quotes">
            <el-button type="primary" size="small" icon="el-icon-plus" @click="quoteDialog = true">建立報價版本</el-button>
            <div v-for="quote in selected.quoteVersions" :key="quote.id" class="quote-version"><div><b>V{{ quote.versionNo }}</b><el-tag size="mini" style="margin-left: 8px">{{ quote.status }}</el-tag><p>{{ quote.scope || '未填寫範圍' }}</p></div><strong>NT$ {{ Number(quote.customerTotal || 0).toLocaleString() }}</strong></div>
          </el-tab-pane>
          <el-tab-pane label="生產閘門" name="production">
            <el-alert :type="readiness && readiness.allowed ? 'success' : 'warning'" :closable="false" show-icon :title="readiness && readiness.allowed ? '已符合開始列印條件' : '仍有生產條件待完成'" />
            <ul class="checks"><li v-for="(value, key) in readiness && readiness.checks" :key="key"><i :class="value ? 'el-icon-success ok' : 'el-icon-warning-outline waiting'" />{{ readinessLabel(key) }}</li></ul>

            <section class="orca-panel">
              <div class="orca-heading"><div><h3>OrcaSlicer 切片</h3><p>設定檔由此系統的 `/profiles` 唯讀目錄提供；切片完成後仍需由人員核准 G-code。</p></div><el-tag type="info">Pinned OrcaSlicer</el-tag></div>
              <el-form label-position="top" class="orca-form">
                <el-form-item label="來源模型"><el-select v-model="orcaForm.sourceFileId" placeholder="選擇案件模型"><el-option v-for="file in sourceFiles" :key="file.id" :label="file.name" :value="file.id" /></el-select></el-form-item>
                <el-form-item label="設定檔名稱"><el-input v-model.trim="orcaForm.profileId" placeholder="例如：corexy-pla-020" /></el-form-item>
                <el-form-item label="印表機 ID"><el-input v-model.trim="orcaForm.printerId" placeholder="選填；預設使用案件印表機" /></el-form-item>
                <el-form-item label="機台／製程設定"><el-input v-model.trim="orcaForm.settingsPath" placeholder="/profiles/machine.json;/profiles/process.json" /></el-form-item>
                <el-form-item label="材料設定"><el-input v-model.trim="orcaForm.filamentPath" placeholder="/profiles/PLA.json" /></el-form-item>
                <el-button type="primary" :loading="orcaSubmitting" :disabled="!orcaForm.sourceFileId || !orcaForm.profileId" @click="queueOrcaSlice">送往 OrcaSlicer</el-button>
              </el-form>
              <el-table v-if="selected.slicerJobs && selected.slicerJobs.length" :data="selected.slicerJobs" size="mini" class="orca-jobs">
                <el-table-column prop="profileId" label="設定檔" min-width="130" />
                <el-table-column prop="status" label="切片狀態" width="105" />
                <el-table-column label="預估" width="130"><template slot-scope="{ row }">{{ row.estimatedMinutes || 0 }} 分／{{ row.estimatedGrams || 0 }} g</template></el-table-column>
                <el-table-column label="核准" width="145"><template slot-scope="{ row }"><el-button v-if="row.status === 'completed' && !row.approvedAt" size="mini" type="success" @click="approveOrcaSlice(row)">核准 G-code</el-button><span v-else>{{ row.approvedAt ? '已核准' : '待完成' }}</span></template></el-table-column>
              </el-table>
            </section>
            <el-button type="success" :disabled="!readiness || !readiness.allowed" @click="createProduction">建立 FarmFlow 生產任務</el-button>

            <div class="operations-panel">
              <template v-if="selected.status === 'ready_to_print'">
                <el-button size="small" @click="suggestSchedule">System scheduling suggestion</el-button>
                <h3>?????</h3>
                <el-input v-model="operations.startAt" placeholder="???? ISO??? 2026-08-05T01:00:00.000Z" />
                <el-input v-model="operations.printerId" placeholder="??? ID" />
                <el-input-number v-model="operations.estimatedMinutes" :min="1" :max="43200" />
                <el-button size="small" @click="confirmSchedule">????</el-button>
                <el-button v-if="selected.schedule && selected.schedule.confirmedAt" size="small" type="primary" @click="recordAttempt('started')">????</el-button>
              </template>
              <template v-if="selected.status === 'printing'">
                <h3>????</h3>
                <el-button size="small" type="success" @click="recordAttempt('completed')">????????</el-button>
                <el-button size="small" type="danger" @click="recordAttempt('failed')">????????</el-button>
              </template>
              <template v-if="selected.status === 'quality_check'">
                <h3>??</h3>
                <el-button size="small" type="success" @click="quickQualityCheck(false)">??????</el-button>
                <el-button size="small" type="warning" @click="quickQualityCheck(true)">??????</el-button>
              </template>
              <template v-if="selected.status === 'ready_for_delivery'">
                <h3>??</h3>
                <el-button size="small" type="primary" @click="markDelivered">?????</el-button>
              </template>
              <template v-if="selected.status === 'completed'">
                <h3>??</h3>
                <el-button size="small" @click="openAfterSales">????????</el-button>
              </template>
            </div>
</el-tab-pane>
          <el-tab-pane label="歷程" name="history">
            <el-timeline><el-timeline-item v-for="item in selected.statusHistory" :key="item.id" :timestamp="formatDate(item.at)">{{ statusLabel(item.from) || '建立' }} → {{ statusLabel(item.to) }} {{ item.reason ? `：${item.reason}` : '' }}</el-timeline-item></el-timeline>
          </el-tab-pane>
        </el-tabs>
        <div class="actions"><el-select v-model="targetStatus" placeholder="變更案件狀態"><el-option v-for="item in statuses" :key="item.value" :label="item.label" :value="item.value" /></el-select><el-button type="primary" :disabled="!targetStatus" @click="changeStatus">套用狀態</el-button></div>
      </div>
    </el-drawer>

    <el-dialog title="建立正式報價版本" :visible.sync="quoteDialog" width="580px">
      <el-form label-width="100px"><el-form-item label="報價範圍"><el-input v-model="quoteForm.scope" type="textarea" :rows="3" /></el-form-item><el-form-item label="材料"><el-input-number v-model="quoteForm.breakdown.material" :min="0" /></el-form-item><el-form-item label="機台工時"><el-input-number v-model="quoteForm.breakdown.machineTime" :min="0" /></el-form-item><el-form-item label="設定費"><el-input-number v-model="quoteForm.breakdown.setup" :min="0" /></el-form-item><el-form-item label="建模"><el-input-number v-model="quoteForm.breakdown.modeling" :min="0" /></el-form-item><el-form-item label="後處理"><el-input-number v-model="quoteForm.breakdown.postProcessing" :min="0" /></el-form-item><el-form-item label="包裝運送"><el-input-number v-model="quoteForm.breakdown.shipping" :min="0" /></el-form-item><el-form-item label="折扣"><el-input-number v-model="quoteForm.breakdown.discount" :min="0" /></el-form-item><el-form-item label="稅額"><el-input-number v-model="quoteForm.breakdown.tax" :min="0" /></el-form-item><el-form-item label="發送客戶"><el-switch v-model="quoteForm.send" /></el-form-item></el-form>
      <div slot="footer"><el-button @click="quoteDialog = false">取消</el-button><el-button type="primary" :loading="savingQuote" @click="saveQuote">建立版本</el-button></div>
    </el-dialog>
  </div>
</template>

<script>
  import { approveCaseSlicerJob, createCaseAfterSales, createCaseOrcaSlice, createCaseProductionJobs, createCaseQuote, confirmCaseSchedule, fetchCase, fetchCases, recordPrintAttempt, recordQualityCheck, suggestCaseScheduleAutomatically, transitionCase, updateCaseDelivery } from '@/api/cases'
  const statuses = [
    ['new', '新案件'], ['under_review', '審核中'], ['supplement_requested', '等待補件'], ['awaiting_customer', '等待客戶回覆'], ['formal_quote_sent', '正式報價已送出'], ['accepted', '客戶已接受'], ['revision_requested', '客戶要求修改'], ['awaiting_payment', '等待付款'], ['paid', '已付款'], ['production_pending', '待生產確認'], ['ready_to_print', '可開始列印'], ['printing', '列印中'], ['quality_check', '品質檢查'], ['ready_for_delivery', '待交付'], ['completed', '已完成'], ['cancelled', '已取消'], ['aftersales', '售後處理'],
  ]
  const quoteForm = () => ({ scope: '', send: true, breakdown: { material: 0, machineTime: 0, setup: 0, modeling: 0, postProcessing: 0, multicolor: 0, packing: 0, shipping: 0, risk: 0, discount: 0, tax: 0 } })
  export default {
    name: 'Cases',
    data() { return { loading: false, cases: [], query: { search: '', status: '' }, statuses: statuses.map(([value, label]) => ({ value, label })), drawerVisible: false, drawerTab: 'overview', selected: null, sourceFiles: [], readiness: null, targetStatus: '', quoteDialog: false, quoteForm: quoteForm(), savingQuote: false, orcaSubmitting: false, orcaForm: { sourceFileId: '', profileId: '', printerId: '', settingsPath: '', filamentPath: '' }, operations: { startAt: '', printerId: '', estimatedMinutes: 60 } } },
    created() { this.load() },
    methods: {
      async load() { this.loading = true; try { const result = await fetchCases(this.query); this.cases = result.cases || [] } finally { this.loading = false } },
      async openCase(row) { const result = await fetchCase(row.id); this.selected = result.case; this.sourceFiles = result.sourceFiles || []; this.readiness = result.readiness; this.targetStatus = ''; this.orcaForm = { sourceFileId: (result.sourceFiles || [])[0]?.id || '', profileId: '', printerId: result.case.printerId || '', settingsPath: '', filamentPath: '' }; this.operations = { startAt: result.case.schedule?.startAt || new Date(Date.now() + 3600000).toISOString(), printerId: result.case.printerId || '', estimatedMinutes: result.case.scheduleSuggestion?.estimatedMinutes || 60 }; this.drawerVisible = true },
      async refreshSelected() { if (!this.selected) return; const result = await fetchCase(this.selected.id); this.selected = result.case; this.sourceFiles = result.sourceFiles || []; this.readiness = result.readiness; await this.load() },
      async changeStatus() { try { await transitionCase(this.selected.id, this.targetStatus); this.$baseMessage('案件狀態已更新。', 'success'); await this.refreshSelected() } catch (_) {} },
      async saveQuote() { this.savingQuote = true; try { await createCaseQuote(this.selected.id, this.quoteForm); this.quoteDialog = false; this.quoteForm = quoteForm(); this.$baseMessage('報價版本已建立。', 'success'); await this.refreshSelected() } finally { this.savingQuote = false } },
      async createProduction() { try { const result = await createCaseProductionJobs(this.selected.id); this.$baseMessage(`已建立 ${result.jobs.length} 個生產任務。`, 'success'); await this.refreshSelected() } catch (_) {} },
      async queueOrcaSlice() { this.orcaSubmitting = true; try { await createCaseOrcaSlice(this.selected.id, this.orcaForm); this.$baseMessage('OrcaSlicer 切片工作已排入獨立 worker。', 'success'); await this.refreshSelected() } finally { this.orcaSubmitting = false } },
      async approveOrcaSlice(job) { try { await approveCaseSlicerJob(this.selected.id, job.id); this.$baseMessage('G-code 已核准，可繼續生產閘門。', 'success'); await this.refreshSelected() } catch (_) {} },
      async suggestSchedule() { try { const result = await suggestCaseScheduleAutomatically(this.selected.id); this.operations.startAt = result.scheduleSuggestion.suggestedStartAt; this.operations.printerId = result.scheduleSuggestion.suggestedPrinterId; this.operations.estimatedMinutes = result.scheduleSuggestion.estimatedMinutes; this.$baseMessage('系統建議已帶入，請由專員確認', 'success'); await this.refreshSelected() } catch (_) {} },
      async confirmSchedule() { try { await confirmCaseSchedule(this.selected.id, { startAt: this.operations.startAt, printerId: this.operations.printerId, note: `Estimated ${this.operations.estimatedMinutes} minutes` }); this.$baseMessage('排程已由專員確認', 'success'); await this.refreshSelected() } catch (_) {} },
      async recordAttempt(action) { try { const queueJobId = (this.selected.productionJobIds || [])[0] || ''; await recordPrintAttempt(this.selected.id, { action, queueJobId, note: action === 'completed' ? '列印完成' : action === 'failed' ? '列印失敗' : '開始列印' }); this.$baseMessage('列印紀錄已更新', 'success'); await this.refreshSelected() } catch (_) {} },
      async quickQualityCheck(reprint) { try { const parts = this.selected.parts.map((part) => ({ partId: part.id, result: reprint ? 'failed' : 'passed', notes: reprint ? '需重印' : '快速品管通過' })); await recordQualityCheck(this.selected.id, { parts, reprint, note: reprint ? '建立重印工作' : '全部零件通過' }); this.$baseMessage(reprint ? '已建立重印工作' : '品管已通過', 'success'); await this.refreshSelected() } catch (_) {} },
      async markDelivered() { try { await updateCaseDelivery(this.selected.id, { method: 'pickup', status: 'delivered', note: '內部交付確認' }); this.$baseMessage('案件已完成交付', 'success'); await this.refreshSelected() } catch (_) {} },
      async openAfterSales() { try { await createCaseAfterSales(this.selected.id, { type: 'reprint', description: '由內部案件面板建立的售後重印', reopenProduction: true }); this.$baseMessage('售後重印案件已建立', 'success'); await this.refreshSelected() } catch (_) {} },
      statusLabel(status) { return (this.statuses.find((item) => item.value === status) || {}).label || status || '' },
      statusType(status) { return ['completed', 'ready_to_print', 'paid'].includes(status) ? 'success' : ['cancelled'].includes(status) ? 'danger' : ['supplement_requested', 'revision_requested', 'awaiting_payment'].includes(status) ? 'warning' : 'info' },
      paymentLabel(status) { return { paid: '已付款', monthly_terms: '月結', waived: '免付款', refunded: '已退款', unpaid: '未付款' }[status] || status },
      workflowIndex(status) { if (['new', 'under_review', 'supplement_requested', 'awaiting_customer'].includes(status)) return 0; if (['formal_quote_sent', 'accepted', 'revision_requested'].includes(status)) return 1; if (['awaiting_payment', 'paid'].includes(status)) return 2; if (['production_pending', 'ready_to_print', 'printing', 'quality_check'].includes(status)) return 3; return 4 },
      readinessLabel(key) { return { acceptedCurrentQuote: '客戶已接受目前報價版本', paymentSatisfied: '付款、月結或免付款條件完成', printerAssigned: '已指派印表機', orcaSliceComplete: 'OrcaSlicer 已產生 G-code', gcodeApproved: 'G-code 已由人員核准', allItemsReady: '全部零件已完成準備' }[key] || key },
      formatDate(value) { return value ? new Date(value).toLocaleString('zh-TW', { hour12: false }) : '—' },
    },
  }
</script>

<style lang="scss" scoped>
  .toolbar { display: flex; gap: 12px; margin-bottom: 18px; } .toolbar .el-input { max-width: 390px; } .toolbar .el-select { width: 160px; }
  .muted { color: #8992a3; font-size: 12px; margin-top: 4px; } .drawer-content { padding: 28px; } .drawer-head { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 18px; } .drawer-head h2 { margin: 3px 0; } .drawer-head p { margin: 4px 0; }
  .case-steps { margin: 22px 0; } .detail-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; } .detail-grid span, .detail-grid b { display: block; } .detail-grid span { color: #8992a3; font-size: 12px; margin-bottom: 4px; } h3 { margin: 22px 0 10px; } .notes { white-space: pre-wrap; color: #4b5563; }
  .quote-version { display: flex; justify-content: space-between; padding: 15px 0; border-bottom: 1px solid #edf0f5; } .quote-version p { margin: 6px 0 0; color: #667085; } .checks { list-style: none; padding: 0; line-height: 2.1; } .checks i { margin-right: 8px; } .ok { color: #17a673; } .waiting { color: #e6a23c; } .orca-panel { margin: 20px 0; padding: 18px; border: 1px solid #dbe5f4; border-radius: 8px; background: #f8fbff; } .orca-heading { display: flex; justify-content: space-between; gap: 12px; } .orca-heading h3 { margin: 0; } .orca-heading p { color: #667085; font-size: 12px; line-height: 1.6; margin: 6px 0 14px; } .orca-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 12px; } .orca-form .el-form-item { margin-bottom: 12px; } .orca-form .el-select { width: 100%; } .orca-form .el-button { align-self: end; justify-self: start; margin-bottom: 12px; } .orca-jobs { margin-top: 6px; } .operations-panel { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 18px; padding-top: 16px; border-top: 1px solid #edf0f5; } .operations-panel h3 { flex-basis: 100%; margin: 0 0 3px; } .operations-panel .el-input { width: 260px; } .actions { display: flex; gap: 10px; margin-top: 22px; padding-top: 18px; border-top: 1px solid #edf0f5; } .actions .el-select { width: 210px; }
  @media (max-width: 680px) { .toolbar { flex-wrap: wrap; } .toolbar .el-input { max-width: none; width: 100%; } .detail-grid { grid-template-columns: 1fr; } }
</style>
