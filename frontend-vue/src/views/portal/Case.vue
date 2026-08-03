<template>
  <main class="case-page" v-loading="loading">
    <section v-if="caseRecord" class="case-card">
      <router-link to="/" class="brand">3DRFM 製造服務</router-link>
      <div class="case-top"><div><p>{{ caseRecord.caseNo }}</p><h1>{{ caseRecord.project }}</h1></div><el-tag :type="statusType">{{ statusLabel }}</el-tag></div>
      <el-divider />
      <div class="summary-grid"><div><span>目前總價</span><strong>{{ caseRecord.quote ? `NT$ ${Number(caseRecord.quote.total).toLocaleString()}` : '專員確認中' }}</strong></div><div><span>付款狀態</span><b>{{ paymentLabel }}</b></div><div><span>交付方式</span><b>{{ caseRecord.delivery ? caseRecord.delivery.method : '待確認' }}</b></div></div>
      <el-alert v-if="caseRecord.quote" type="info" :closable="false" show-icon :title="`報價 V${caseRecord.quote.versionNo} 有效至 ${formatDate(caseRecord.quote.validUntil)}`" :description="caseRecord.quote.scope || '專員將依案件範圍執行。'" />
      <h2>零件</h2><el-table :data="caseRecord.parts" size="small"><el-table-column prop="name" label="零件" /><el-table-column prop="material" label="材料" /><el-table-column prop="color" label="顏色" /><el-table-column prop="quantity" label="數量" width="80" /></el-table>
      <div v-if="caseRecord.status === 'formal_quote_sent'" class="decision-actions"><el-button type="primary" :loading="deciding" @click="decide('accepted')">接受報價</el-button><el-button :loading="deciding" @click="decide('revision')">要求修改</el-button></div>
      <p class="help">需要補件、詢問進度、取消或終止製作時，請透過原本的 LINE 對話由專員處理；所有客服對話會保留在 Chatwoot。</p>
    </section>
    <el-result v-else-if="error" icon="warning" title="案件連結無效或已失效" sub-title="請由原本的 LINE 對話取得最新案件連結。" />
  </main>
</template>

<script>
  import { decidePublicCase, fetchPublicCase } from '@/api/cases'
  export default {
    name: 'PublicCase',
    data() { return { loading: true, error: false, caseRecord: null, deciding: false } },
    computed: {
      token() { return this.$route.query.token || '' },
      statusLabel() { return { new: '新案件', under_review: '審核中', supplement_requested: '等待補件', awaiting_customer: '等待回覆', formal_quote_sent: '正式報價已送出', accepted: '已接受', revision_requested: '要求修改', awaiting_payment: '等待付款', paid: '已付款', production_pending: '待生產確認', ready_to_print: '可開始列印', printing: '列印中', quality_check: '品質檢查', ready_for_delivery: '待交付', completed: '已完成', cancelled: '已取消', aftersales: '售後處理' }[this.caseRecord.status] || this.caseRecord.status },
      paymentLabel() { return { paid: '已付款', monthly_terms: '月結', waived: '免付款', refunded: '已退款', unpaid: '尚未付款' }[this.caseRecord.paymentStatus] || this.caseRecord.paymentStatus },
      statusType() { return ['paid', 'ready_to_print', 'completed'].includes(this.caseRecord.status) ? 'success' : ['cancelled'].includes(this.caseRecord.status) ? 'danger' : 'info' },
    },
    async created() { await this.load() },
    methods: {
      async load() { this.loading = true; this.error = false; try { this.caseRecord = await fetchPublicCase(this.$route.params.id, this.token) } catch (_) { this.error = true } finally { this.loading = false } },
      async decide(decision) { this.deciding = true; try { const result = await decidePublicCase(this.caseRecord.id, this.token, decision); this.caseRecord = result.case; this.$baseMessage('案件決定已送出。', 'success') } finally { this.deciding = false } },
      formatDate(value) { return value ? new Date(value).toLocaleDateString('zh-TW') : '待確認' },
    },
  }
</script>

<style lang="scss" scoped>
  .case-page { min-height: 100vh; padding: 52px 20px; background: #f5f7fb; } .case-card { max-width: 760px; margin: auto; background: #fff; border-radius: 16px; padding: 34px; box-shadow: 0 12px 35px rgba(26,39,70,.08); } .brand { color: #3563e9; text-decoration: none; font-weight: 800; } .case-top { margin-top: 26px; display: flex; justify-content: space-between; gap: 18px; } .case-top p { color: #667085; margin: 0; } h1 { margin: 6px 0; } h2 { margin: 30px 0 12px; font-size: 18px; } .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin: 22px 0; } .summary-grid span, .summary-grid b, .summary-grid strong { display: block; } .summary-grid span { color: #667085; font-size: 13px; margin-bottom: 6px; } .summary-grid strong { color: #3563e9; font-size: 22px; } .decision-actions { display: flex; gap: 10px; margin-top: 26px; } .help { margin-top: 28px; padding-top: 18px; border-top: 1px solid #edf0f5; color: #667085; line-height: 1.7; font-size: 13px; } @media (max-width: 640px) { .case-card { padding: 24px 18px; } .summary-grid { grid-template-columns: 1fr; } .decision-actions { flex-wrap: wrap; } }
</style>
