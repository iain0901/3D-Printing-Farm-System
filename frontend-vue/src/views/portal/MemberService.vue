<template>
  <div class="service-desk">
    <h1>會員服務工作台</h1>
    <p>處理會員售後、免費列印申請、案件訊息與已開立單據。</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <button :disabled="busy" @click="load">重新整理</button>
    <section>
      <h2>服務申請</h2>
      <label>
        篩選
        <select v-model="filter">
          <option value="all">全部申請</option>
          <option value="pending">待處理</option>
          <option value="free_print">免費列印</option>
          <option value="account_deletion">帳號刪除申請</option>
        </select>
      </label>
      <article v-for="item in filtered" :key="item.id">
        <header>
          <h3>{{ types[item.type] || '會員服務' }}</h3>
          <span>{{ status(item.status) }}</span>
        </header>
        <p>會員：{{ customerName(item.customerId) }} · {{ new Date(item.createdAt).toLocaleString('zh-TW') }}</p>
        <p v-if="item.caseId">案件：{{ item.caseId }}</p>
        <p v-if="item.orderId">訂單：{{ item.orderId }}</p>
        <p v-if="item.stationName">{{ item.stationName }} · {{ item.material }}</p>
        <p>{{ item.note }}</p>
        <div class="actions">
          <button
            v-for="attachment in item.attachments"
            :key="attachment.id"
            :disabled="busy"
            @click="download(`/requests/${item.id}/attachments/${attachment.id}`, attachment.name)"
          >
            下載 {{ attachment.name }}
          </button>
          <button
            v-for="(model, index) in item.modelIds"
            :key="model"
            :disabled="busy"
            @click="download(`/models/${model}/file`, `模型-${index + 1}.stl`)"
          >
            下載模型 {{ index + 1 }}
          </button>
        </div>
        <p v-if="item.pickupCode">取件碼：{{ item.pickupCode }}</p>
        <p v-for="reply in item.replies" :key="reply.id" class="reply">{{ reply.authorName }}：{{ reply.body }}</p>
        <form @submit.prevent="resolve(item)">
          <label>
            處理狀態
            <select v-model="updates[item.id].status">
              <option value="pending">待處理</option>
              <option value="processing">處理中</option>
              <option value="approved">已通過</option>
              <option value="rejected">未通過</option>
              <option v-if="item.type === 'free_print'" value="ready_for_pickup">可取件</option>
              <option value="completed">已完成</option>
            </select>
          </label>
          <label>
            回覆會員
            <textarea v-model="updates[item.id].note" required maxlength="2000" rows="3" />
          </label>
          <button :disabled="busy">更新並通知會員</button>
        </form>
      </article>
      <p v-if="!filtered.length">沒有符合條件的申請。</p>
    </section>
    <section>
      <h2>會員案件訊息</h2>
      <article v-for="group in conversations" :key="group.caseId">
        <h3>案件 {{ group.caseId }}</h3>
        <p v-for="message in group.messages" :key="message.id">
          <b>{{ message.authorName }}：</b>
          {{ message.body }}
        </p>
        <form @submit.prevent="reply(group.caseId)">
          <label>
            專員回覆
            <textarea v-model="replyDrafts[group.caseId]" maxlength="2000" required rows="3" />
          </label>
          <button :disabled="busy">送出回覆</button>
        </form>
      </article>
      <p v-if="!conversations.length">尚無會員案件訊息。</p>
    </section>
    <section>
      <h2>上傳已開立單據</h2>
      <p>僅上傳已正式開立的發票或收據 PDF；此功能不代替電子發票開立服務。</p>
      <form class="document-form" @submit.prevent="issueDocument">
        <label>
          會員
          <select v-model="document.customerId" required>
            <option value="">選擇會員</option>
            <option v-for="customer in customers" :key="customer.id" :value="customer.id">
              {{ customer.name }} · {{ customer.email }}
            </option>
          </select>
        </label>
        <label>
          類型
          <select v-model="document.kind">
            <option value="receipt">收據</option>
            <option value="invoice">發票</option>
          </select>
        </label>
        <label>
          單據名稱
          <input v-model="document.title" required maxlength="120" />
        </label>
        <label>
          單據號碼
          <input v-model="document.number" required maxlength="60" />
        </label>
        <label>
          PDF 檔案
          <input type="file" accept="application/pdf" required @change="documentFile = $event.target.files[0]" />
          <span class="file-choice">{{ documentFile ? documentFile.name : '選擇已開立 PDF 單據' }}</span>
        </label>
        <button :disabled="busy">上傳並通知會員</button>
      </form>
    </section>
  </div>
</template>
<script setup>
  import { computed, onMounted, reactive, ref } from 'vue'
  import request from '@/utils/request'
  import { portalStatus } from '@/utils/portal-presentation.mjs'
  const requests = ref([]),
    messages = ref([]),
    customers = ref([]),
    filter = ref('all'),
    busy = ref(false),
    error = ref(''),
    notice = ref(''),
    updates = reactive({}),
    replyDrafts = reactive({}),
    documentFile = ref(null)
  const document = reactive({ customerId: '', kind: 'receipt', title: '列印服務收據', number: '' })
  const types = {
    free_print: '免費列印申請',
    account_deletion: '帳號刪除申請',
    cancellation: '取消申請',
    reprint: '補印申請',
    defect: '品質問題',
    delivery: '交付問題',
    refund: '退款申請',
    other: '其他問題',
  }
  const status = (s) => ({ approved: '已通過', ready_for_pickup: '可取件' }[s] || portalStatus(s))
  const filtered = computed(() =>
    requests.value.filter((r) => filter.value === 'all' || r.status === filter.value || r.type === filter.value)
  )
  const conversations = computed(() =>
    Object.entries(Object.groupBy(messages.value, (m) => m.caseId)).map(([caseId, messages]) => ({ caseId, messages }))
  )
  const customerName = (id) => customers.value.find((c) => c.id === id)?.name || id
  async function act(fn, text) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      await fn()
      notice.value = text || ''
    } catch (e) {
      error.value = e.response?.data?.error || '操作失敗，請重試'
    } finally {
      busy.value = false
    }
  }
  async function load() {
    const [data, list] = await Promise.all([request({ url: '/api/member-service' }), request({ url: '/api/customers' })])
    requests.value = data.requests
    messages.value = data.messages
    customers.value = list
    requests.value.forEach((r) => (updates[r.id] = { status: r.status, note: '' }))
  }
  async function resolve(item) {
    await act(async () => {
      await request({ url: `/api/member-service/requests/${item.id}`, method: 'patch', data: updates[item.id] })
      await load()
    }, '處理結果已更新')
  }
  async function reply(id) {
    await act(async () => {
      await request({ url: `/api/member-service/cases/${id}/messages`, method: 'post', data: { body: replyDrafts[id] } })
      replyDrafts[id] = ''
      await load()
    }, '專員回覆已送出')
  }
  async function download(path, name) {
    await act(async () => {
      const bytes = await request({ url: '/api/member-service' + path, responseType: 'arraybuffer' })
      const link = window.document.createElement('a')
      const url = URL.createObjectURL(new Blob([bytes]))
      link.href = url
      link.download = name
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }
  async function issueDocument() {
    await act(async () => {
      if (!documentFile.value) throw new Error('請選擇 PDF')
      const form = new FormData()
      form.append('payload', JSON.stringify(document))
      form.append('files', documentFile.value, documentFile.value.name)
      await request({ url: '/api/member-service/documents', method: 'post', data: form, headers: { 'Content-Type': undefined } })
    }, '單據已提供給會員')
  }
  onMounted(() => act(load))
</script>
<style scoped>
  .service-desk {
    max-width: 1100px;
    margin: auto;
    padding: 24px;
    color: #183d34;
  }
  .service-desk h1 {
    font-size: 28px;
  }
  .service-desk section {
    background: white;
    border: 1px solid #dce2db;
    padding: 24px;
    border-radius: 8px;
    margin: 24px 0;
  }
  .service-desk article {
    padding: 20px 0;
    border-bottom: 1px solid #dce2db;
  }
  .service-desk header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
  }
  .service-desk label {
    display: grid;
    gap: 8px;
    font-size: 13px;
    margin: 12px 0;
  }
  .service-desk input,
  .service-desk select,
  .service-desk textarea {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    border: 1px solid #cdd7cc;
    border-radius: 5px;
    padding: 10px;
    font: inherit;
    box-sizing: border-box;
  }
  .service-desk input[type='file'] {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .file-choice {
    padding: 12px;
    border: 1px solid #cdd7cc;
    border-radius: 5px;
    cursor: pointer;
  }
  .service-desk label:focus-within .file-choice {
    outline: 2px solid #658e78;
  }
  .service-desk button {
    padding: 10px 16px;
    border: 1px solid #cdd7cc;
    border-radius: 5px;
    background: #214b3d;
    color: white;
    cursor: pointer;
  }
  .service-desk button:disabled {
    opacity: 0.5;
  }
  .service-desk p {
    font-size: 13px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .service-desk .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .reply {
    background: #f0f3eb;
    padding: 12px;
  }
  .document-form {
    max-width: 650px;
  }
  .service-desk [role='alert'] {
    background: #fae8e2;
    padding: 16px;
    color: #8a352c;
  }
</style>
