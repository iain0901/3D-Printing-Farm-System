<template>
  <div class="member-hub">
    <header class="hub-heading">
      <div>
        <p class="eyebrow">3DRFM ／ 會員工作台</p>
        <h1>{{ titles[section] || '會員工作台' }}</h1>
        <p>讓模型、製作細節與每一次討論，都有地方保存。</p>
      </div>
      <div class="card-actions">
        <button :disabled="busy || loading" @click="load">重新整理</button>
        <router-link class="solid" to="/quote">新增列印需求 ↗</router-link>
      </div>
    </header>
    <nav class="hub-nav" aria-label="會員服務">
      <router-link
        v-for="item in navigation"
        :key="item.id"
        :to="{ path: '/portal/workspace', query: { section: item.id } }"
        :aria-current="section === item.id ? 'page' : undefined"
      >
        {{ item.label }}
        <span v-if="item.id === 'notifications' && unread">{{ unread }}</span>
      </router-link>
      <router-link to="/portal/dashboard?tab=addresses">收件地址</router-link>
    </nav>
    <p v-if="error" class="hub-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="hub-notice" role="status">{{ notice }}</p>
    <div v-if="loading" class="hub-panel" role="status">正在載入您的工作台…</div>
    <div v-else-if="!data" class="hub-panel">
      <p>目前無法載入資料。</p>
      <button @click="load">重新載入</button>
    </div>
    <template v-else>
      <section v-if="section === 'models'" class="hub-panel">
        <div class="panel-top">
          <div>
            <h2>我的模型庫</h2>
            <p>{{ size(data.storage.usedBytes) }} ／ {{ size(data.storage.maxBytes) }}。模型版本會保留，封存可隨時復原。</p>
          </div>
          <label class="upload-button">
            ＋ 上傳 STL
            <input type="file" accept=".stl" :disabled="busy" @change="uploadModel($event)" />
          </label>
        </div>
        <div class="filter-row">
          <label>
            搜尋模型
            <input v-model="search" type="search" placeholder="模型名稱" />
          </label>
          <label>
            顯示
            <select v-model="modelFilter">
              <option value="active">使用中</option>
              <option value="favorites">我的收藏</option>
              <option value="archived">已封存</option>
            </select>
          </label>
          <label>
            專案
            <select v-model="projectFilter">
              <option value="">所有專案</option>
              <option v-for="project in data.projects" :key="project.id" :value="project.id">{{ project.name }}</option>
            </select>
          </label>
        </div>
        <div v-if="filteredModels.length" class="model-grid">
          <article v-for="model in filteredModels" :key="model.id" class="model-card">
            <p class="model-index">STL ／ V{{ model.version }}</p>
            <h3>{{ model.name }}</h3>
            <p>{{ model.dimensions.join(' × ') }} mm</p>
            <p>{{ model.triangleCount.toLocaleString() }} 面 · {{ size(model.bytes) }}</p>
            <div class="card-actions">
              <button :disabled="busy" @click="preview(model)">3D 預覽</button>
              <button :disabled="busy" @click="downloadModel(model)">下載</button>
              <router-link :to="{ path: '/quote', query: { model: model.id } }">用於估價 ↗</router-link>
              <button :disabled="busy" @click="updateModel(model, { favorite: !model.favorite })">
                {{ model.favorite ? '取消收藏' : '收藏' }}
              </button>
              <button :disabled="busy" @click="updateModel(model, { archived: !model.archivedAt })">
                {{ model.archivedAt ? '復原模型' : '封存模型' }}
              </button>
            </div>
            <label>
              模型名稱
              <input v-model="model.name" maxlength="180" @change="updateModel(model, { name: model.name })" />
            </label>
            <label>
              所屬專案
              <select v-model="model.projectId" :disabled="busy" @change="updateModel(model, { projectId: model.projectId })">
                <option value="">未分類</option>
                <option v-for="project in ownProjects" :key="project.id" :value="project.id">{{ project.name }}</option>
              </select>
            </label>
            <label class="version-upload">
              上傳新版本
              <input type="file" accept=".stl" :disabled="busy" @change="uploadModel($event, model.id)" />
              <span class="file-choice">選擇 STL 新版本</span>
            </label>
          </article>
        </div>
        <div v-else class="hub-empty">
          <h3>{{ modelFilter === 'archived' ? '目前沒有封存模型' : '把下一件作品放進模型庫。' }}</h3>
          <p>上傳 STL 後，就能保存版本、分組收藏，再帶入線上工作台。</p>
        </div>
        <section v-if="previewData" class="preview-panel">
          <div class="panel-top">
            <h3>{{ previewData.name }}</h3>
            <button @click="previewData = null">關閉預覽</button>
          </div>
          <model-viewer :array-buffer="previewData.buffer" :filename="previewData.name" :height="300" />
        </section>
      </section>
      <section v-if="section === 'drafts'" class="hub-panel">
        <h2>接著完成你的作品</h2>
        <p>草稿包含原始模型、擺放、材料與配色。登入後可在工作台保存，也能跨裝置繼續編輯。</p>
        <article v-for="draft in data.drafts" :key="draft.id" class="record-row">
          <div>
            <h3>{{ draft.name }}</h3>
            <p>{{ draft.modelCount }} 個模型 · {{ draft.material }} · 版本 {{ draft.revision }}</p>
            <small>更新於 {{ date(draft.updatedAt) }}</small>
          </div>
          <div class="card-actions">
            <router-link :to="{ path: '/quote', query: { draft: draft.id } }">繼續編輯 ↗</router-link>
            <router-link v-if="draft.caseId" :to="caseLink(draft.caseId)">查看案件</router-link>
            <button :disabled="busy" @click="deleteDraft(draft)">刪除草稿</button>
          </div>
        </article>
        <div v-if="!data.drafts.length" class="hub-empty">
          <h3>尚未保存草稿</h3>
          <router-link to="/quote">開啟線上工作台 ↗</router-link>
        </div>
      </section>
      <template v-if="section === 'projects'">
        <section class="hub-panel">
          <h2>依專題、實驗室或零件系列整理</h2>
          <form class="form-grid" @submit.prevent="createProject">
            <label>
              專案名稱
              <input v-model="projectForm.name" required maxlength="120" />
            </label>
            <label>
              用途
              <select v-model="projectForm.type">
                <option value="personal">個人作品</option>
                <option value="school">學校／專題</option>
                <option value="lab">實驗室</option>
                <option value="business">公司／常用零件</option>
              </select>
            </label>
            <label>
              課程／計畫／採購編號
              <input v-model="projectForm.reference" maxlength="120" />
            </label>
            <button class="solid" :disabled="busy">建立專案</button>
          </form>
        </section>
        <section v-if="invitations.length" class="hub-panel">
          <h2>待回覆邀請</h2>
          <article v-for="invite in invitations" :key="invite.id" class="record-row">
            <span>{{ invite.name }}</span>
            <button :disabled="busy" @click="acceptInvite(invite.id)">接受檢視邀請</button>
          </article>
        </section>
        <section class="hub-panel">
          <article v-for="project in data.projects" :key="project.id" class="project-row">
            <div class="panel-top">
              <div>
                <h3>{{ project.name }}</h3>
                <p>{{ project.reference || '未填寫計畫編號' }} · {{ project.isOwner ? '管理者' : '檢視成員' }}</p>
              </div>
              <button @click="openProject(project.id)">查看專案</button>
            </div>
            <form v-if="project.isOwner" class="inline-form" @submit.prevent="invite(project.id)">
              <label>
                邀請已註冊會員檢視
                <input v-model="inviteEmails[project.id]" type="email" required placeholder="會員電子郵件" />
              </label>
              <button :disabled="busy">送出邀請</button>
            </form>
            <p v-if="project.isOwner" class="small">接受邀請後可查看此專案共用模型與案件摘要，不包含私人對話、地址或付款資料。</p>
            <div v-if="project.isOwner && project.members.length" class="card-actions">
              <button v-for="(member, index) in project.members" :key="member" :disabled="busy" @click="removeMember(project.id, member)">
                移除成員 {{ index + 1 }}
              </button>
            </div>
          </article>
          <p v-if="!data.projects.length">尚未建立專案。</p>
        </section>
        <section v-if="projectDetail" class="hub-panel">
          <h2>{{ projectDetail.project.name }}</h2>
          <h3>共用模型</h3>
          <div v-for="model in projectDetail.models" :key="model.id" class="record-row">
            <span>{{ model.name }} · V{{ model.version }}</span>
            <button :disabled="busy" @click="sharedDownload(model)">下載共用模型</button>
          </div>
          <p v-if="!projectDetail.models.length">尚無共用模型。管理者可從模型庫指定所屬專案。</p>
          <h3>製作進度</h3>
          <p v-for="item in projectDetail.cases" :key="item.id">{{ item.project }} · {{ status(item.status) }}</p>
        </section>
      </template>
      <template v-if="section === 'case'">
        <section v-if="caseDetail" class="hub-panel">
          <div class="panel-top">
            <div>
              <p class="eyebrow">{{ caseDetail.case.caseNo }}</p>
              <h2>{{ caseDetail.case.project }}</h2>
            </div>
            <span class="status-chip">{{ status(caseDetail.case.status) }}</span>
          </div>
          <p>{{ caseDetail.case.notes || '尚無補充製作備註。' }}</p>
          <div class="case-facts">
            <div>
              <span>報價總額</span>
              <strong>{{ money(caseDetail.case.quote?.total) }}</strong>
            </div>
            <div>
              <span>付款狀態</span>
              <strong>{{ status(caseDetail.case.paymentStatus) }}</strong>
            </div>
            <div>
              <span>交付方式</span>
              <strong>
                {{
                  caseDetail.case.deliveryPreference?.method === 'pickup'
                    ? '現場取件'
                    : caseDetail.case.deliveryPreference
                    ? '配送'
                    : '待確認'
                }}
              </strong>
            </div>
          </div>
          <h3>模型與規格</h3>
          <article v-for="part in caseDetail.case.parts" :key="part.id" class="record-row">
            <span>{{ part.name }}</span>
            <span>{{ part.material }} · {{ part.color }} · {{ part.quantity }} 份</span>
          </article>
          <h3>案件進度</h3>
          <ol class="case-timeline">
            <li v-for="entry in caseDetail.case.history" :key="entry.id">
              <b>{{ status(entry.to) }}</b>
              <time>{{ date(entry.createdAt) }}</time>
            </li>
          </ol>
          <h3>歷次報價</h3>
          <article v-for="quote in caseDetail.case.quotes" :key="quote.id" class="record-row">
            <span>
              第 {{ quote.versionNo }} 版 · {{ money(quote.total) }}
              <small>{{ quote.scope }}</small>
            </span>
            <span>有效至 {{ date(quote.validUntil) }}</span>
          </article>
          <p v-if="!caseDetail.case.quotes.length">專員確認模型與製作條件後提供正式報價。</p>
          <div class="card-actions">
            <template v-if="caseDetail.case.status === 'formal_quote_sent'">
              <button :disabled="busy" @click="caseDecision('accepted')">接受報價</button>
              <button :disabled="busy" @click="caseDecision('revision')">要求修改</button>
            </template>
            <button v-if="caseDetail.case.quote" :disabled="busy" @click="printDocument('quote', caseDetail.case.id)">
              下載／列印報價單
            </button>
            <button
              v-if="['accepted', 'awaiting_payment'].includes(caseDetail.case.status) && caseDetail.case.paymentStatus === 'unpaid'"
              :disabled="busy"
              @click="createCheckoutOrder"
            >
              建立訂單並前往付款
            </button>
            <router-link :to="{ path: '/portal/workspace', query: { section: 'support', caseId: caseDetail.case.id } }">
              申請取消／售後
            </router-link>
            <button v-if="caseDetail.case.workspaceDraft" :disabled="busy" @click="reorderCase">再次製作／重新報價</button>
          </div>
          <h3>交付資訊</h3>
          <p v-if="caseDetail.case.delivery">
            {{ caseDetail.case.delivery.carrier || '交付方式待確認' }} · {{ caseDetail.case.delivery.trackingNumber || '尚無物流單號' }} ·
            {{ status(caseDetail.case.delivery.status) }}
          </p>
          <p v-else>出貨或開放取件後將顯示交付資訊。</p>
          <a
            v-if="trackingPortal(caseDetail.case.delivery?.carrier)"
            :href="trackingPortal(caseDetail.case.delivery.carrier)"
            target="_blank"
            rel="noopener noreferrer"
          >
            前往物流公司查詢（請使用上述單號） ↗
          </a>
        </section>
        <section v-if="caseDetail" class="hub-panel">
          <h2>和專員討論</h2>
          <article v-for="message in caseDetail.messages" :key="message.id" class="conversation" :class="message.author">
            <b>{{ message.authorName }}</b>
            <time>{{ date(message.createdAt) }}</time>
            <p>{{ message.body }}</p>
          </article>
          <p v-if="!caseDetail.messages.length">材質、尺寸或製作細節，都可以在這裡補充。</p>
          <form @submit.prevent="sendMessage">
            <label>
              給專員的訊息
              <textarea v-model="messageText" required maxlength="2000" rows="3" />
            </label>
            <button class="solid" :disabled="busy">送出訊息</button>
          </form>
        </section>
      </template>
      <section v-if="section === 'notifications'" class="hub-panel">
        <div class="panel-top">
          <h2>{{ unread }} 則未讀通知</h2>
          <button :disabled="busy || !unread" @click="markRead()">全部標為已讀</button>
        </div>
        <article
          v-for="notification in data.notifications"
          :key="notification.id"
          class="notification record-row"
          :class="{ unread: !notification.readAt }"
        >
          <div>
            <h3>{{ notification.title }}</h3>
            <p>{{ notification.body }}</p>
            <small>{{ date(notification.createdAt) }}</small>
          </div>
          <div class="card-actions">
            <router-link :to="notification.link" @click="markRead(notification.id)">查看</router-link>
            <button v-if="!notification.readAt" :disabled="busy" @click="markRead(notification.id)">標為已讀</button>
          </div>
        </article>
        <p v-if="!data.notifications.length">目前沒有新通知。</p>
      </section>
      <template v-if="section === 'settings'">
        <section class="hub-panel">
          <h2>個人與核銷資料</h2>
          <form class="form-grid" @submit.prevent="saveSettings">
            <label>
              姓名
              <input v-model="profile.name" required maxlength="120" autocomplete="name" />
            </label>
            <label>
              電子郵件
              <input :value="data.customer.email" readonly type="email" />
            </label>
            <label>
              聯絡電話
              <input v-model="profile.phone" maxlength="60" autocomplete="tel" />
            </label>
            <label>
              公司名稱
              <input v-model="profile.company" maxlength="120" />
            </label>
            <label>
              學校
              <input v-model="profile.school" maxlength="120" />
            </label>
            <label>
              系所／實驗室
              <input v-model="profile.department" maxlength="120" />
            </label>
            <label>
              單據抬頭
              <input v-model="profile.billingTitle" maxlength="120" />
            </label>
            <label>
              統一編號
              <input v-model="profile.taxId" pattern="[0-9]{8}|" maxlength="8" inputmode="numeric" />
            </label>
            <button class="solid" :disabled="busy">儲存會員資料</button>
          </form>
          <h3>通知偏好</h3>
          <label class="checkbox">
            <input v-model="profile.notifications.email" type="checkbox" />
            Email 通知
          </label>
          <label class="checkbox">
            <input v-model="profile.notifications.line" type="checkbox" />
            LINE 通知
          </label>
          <p class="small">
            偏好會和會員資料一起保存。進度也會保留在通知中心；{{
              data.capabilities.emailNotifications ? 'Email 通知已啟用。' : 'Email 通知尚待服務設定。'
            }}{{ data.capabilities.lineNotifications ? 'LINE 通知需先由專員確認會員綁定。' : 'LINE 通知尚待服務設定。' }}
          </p>
        </section>
        <section class="hub-panel">
          <h2>變更密碼</h2>
          <form class="form-grid" @submit.prevent="changePassword">
            <label>
              目前密碼
              <input v-model="password.currentPassword" type="password" required autocomplete="current-password" maxlength="256" />
            </label>
            <label>
              新密碼
              <input v-model="password.newPassword" type="password" required minlength="8" maxlength="256" autocomplete="new-password" />
            </label>
            <label>
              再次輸入新密碼
              <input v-model="password.confirm" type="password" required minlength="8" autocomplete="new-password" />
            </label>
            <button :disabled="busy">更新密碼</button>
          </form>
          <p class="small">變更後，其他登入工作階段會登出。</p>
        </section>
        <section class="hub-panel">
          <h2>登入工作階段</h2>
          <article v-for="session in sessions" :key="session.id" class="record-row">
            <div>
              <b>{{ session.current ? '目前使用中的登入' : '其他登入' }}</b>
              <p>{{ session.device }}</p>
              <p>最近使用 {{ date(session.lastSeenAt) }}</p>
              <small>建立於 {{ date(session.createdAt) }}</small>
            </div>
            <button :disabled="busy" @click="revokeSession(session)">
              {{ session.current ? '登出目前工作階段' : '登出這個工作階段' }}
            </button>
          </article>
        </section>
        <section class="hub-panel">
          <h2>帳號與個人資料刪除申請</h2>
          <p>送出後由專員處理，依法需保留的交易資料與進行中訂單會先確認。</p>
          <p v-if="data.preferences.deletionRequestedAt">已於 {{ date(data.preferences.deletionRequestedAt) }} 提出申請。</p>
          <form v-else class="inline-form" @submit.prevent="requestDeletion">
            <label>
              輸入密碼確認
              <input v-model="deletionPassword" type="password" required autocomplete="current-password" />
            </label>
            <button :disabled="busy">提出刪除申請</button>
          </form>
        </section>
      </template>
      <template v-if="section === 'billing'">
        <section class="hub-panel">
          <h2>付款與單據</h2>
          <p>可付款的正式訂單請前往「訂單與配送」。付款完成並驗證後才能下載付款紀錄。</p>
          <router-link to="/portal/dashboard?tab=orders">查看訂單與付款 ↗</router-link>
          <article v-for="order in billing.orders" :key="order.id" class="record-row">
            <div>
              <h3>{{ order.id }}</h3>
              <p>
                {{ money(Math.max(0, Number(order.value || 0) - Number(order.discount || 0))) }} ·
                {{ status(order.payment?.status || 'unpaid') }}
              </p>
            </div>
            <button v-if="order.payment?.status === 'paid'" :disabled="busy" @click="printDocument('payment', order.id)">
              下載付款紀錄
            </button>
          </article>
        </section>
        <section class="hub-panel">
          <h2>已開立單據</h2>
          <p>報價單可在案件詳情下載。發票與收據由專員確認開立後上傳，不會將報價單當成發票。</p>
          <article v-for="doc in data.documents" :key="doc.id" class="record-row">
            <span>{{ doc.title }} · {{ doc.number }}</span>
            <button :disabled="busy" @click="downloadDocument(doc)">下載單據</button>
          </article>
          <p v-if="!data.documents.length">目前沒有已開立單據。</p>
        </section>
      </template>
      <section v-if="section === 'rewards'" class="hub-panel">
        <p class="eyebrow">會員回饋</p>
        <h2>{{ rewards.balance || 0 }} 點可使用</h2>
        <p>{{ rewards.expirationNote }}</p>
        <h3>點數紀錄</h3>
        <article v-for="entry in rewards.entries" :key="entry.id" class="record-row">
          <div>
            <b>{{ entry.reason }}</b>
            <small>{{ date(entry.createdAt) }}</small>
          </div>
          <strong>{{ entry.points > 0 ? '+' : '' }}{{ entry.points }} 點</strong>
        </article>
        <p v-if="!rewards.entries?.length">尚無點數異動紀錄。</p>
        <h3>可用優惠</h3>
        <article v-for="coupon in rewards.coupons" :key="coupon.code" class="record-row">
          <div>
            <b>{{ coupon.code }}</b>
            <p>
              {{ coupon.type === 'percent' ? `折抵 ${coupon.value}%` : `折抵 ${money(coupon.value)}` }} · 最低消費
              {{ money(coupon.minOrderValue || 0) }}
            </p>
          </div>
          <span>{{ coupon.validUntil ? `到期 ${date(coupon.validUntil)}` : '未設定到期日' }}</span>
        </article>
        <p v-if="!rewards.coupons?.length">目前沒有可用優惠。</p>
      </section>
      <template v-if="section === 'support'">
        <section class="hub-panel">
          <h2>取消、補印與問題回報</h2>
          <p>申請送出後由專員確認；送出申請不會立即取消訂單或退款。</p>
          <form class="form-grid" @submit.prevent="submitRequest">
            <label>
              申請類型
              <select v-model="requestForm.type">
                <option value="defect">列印品質／瑕疵</option>
                <option value="reprint">補印申請</option>
                <option value="delivery">配送／取件問題</option>
                <option value="cancellation">取消申請</option>
                <option value="refund">退款申請</option>
                <option value="other">其他問題</option>
              </select>
            </label>
            <label>
              案件
              <select v-model="requestForm.caseId">
                <option value="">改用訂單編號</option>
                <option v-for="item in cases" :key="item.id" :value="item.id">{{ item.project }}</option>
              </select>
            </label>
            <label v-if="!requestForm.caseId">
              訂單編號
              <input v-model="requestForm.orderId" required maxlength="100" />
            </label>
            <label class="wide">
              問題說明
              <textarea v-model="requestForm.note" required maxlength="2000" rows="4" />
            </label>
            <label class="wide">
              附加照片（最多 3 張，每張 5 MB）
              <span class="file-upload">
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple @change="requestPhotos = [...$event.target.files]" />
                <span class="file-choice">選擇照片</span>
              </span>
              <span>{{ requestPhotos.length ? requestPhotos.map((f) => f.name).join('、') : '尚未選擇照片' }}</span>
            </label>
            <button class="solid" :disabled="busy">提交申請</button>
          </form>
        </section>
        <section class="hub-panel">
          <h2>我的服務申請</h2>
          <article v-for="item in serviceRequests" :key="item.id" class="service-record">
            <div class="panel-top">
              <h3>{{ requestTypes[item.type] || '服務申請' }}</h3>
              <span class="status-chip">{{ status(item.status) }}</span>
            </div>
            <p>{{ item.note }}</p>
            <small>{{ date(item.createdAt) }}</small>
            <div class="card-actions">
              <button
                v-for="attachment in item.attachments"
                :key="attachment.id"
                :disabled="busy"
                @click="downloadAttachment(item, attachment)"
              >
                {{ attachment.name }}
              </button>
            </div>
            <p v-for="reply in item.replies" :key="reply.id" class="service-reply">專員回覆：{{ reply.body }}</p>
          </article>
          <p v-if="!serviceRequests.length">尚未提出服務申請。</p>
        </section>
      </template>
      <template v-if="section === 'free-print'">
        <section class="hub-panel station-panel">
          <p class="eyebrow">免費列印站點 01</p>
          <h2>清華大學水木書苑</h2>
          <p>
            使用材料：
            <b>3DSTU_PETG</b>
            。選擇已保存的單色 PETG 草稿提出申請。
          </p>
          <p>每位會員同時可有一件申請處理中。資格、可列印範圍與時段由站點確認，審核通過前不代表已保留名額。</p>
          <form class="form-grid" @submit.prevent="applyFreePrint">
            <label>
              選擇模型草稿
              <select v-model="freePrint.draftId" required>
                <option value="">請選擇</option>
                <option v-for="draft in data.drafts.filter((d) => d.material === 'PETG')" :key="draft.id" :value="draft.id">
                  {{ draft.name }}
                </option>
              </select>
            </label>
            <label>
              用途與補充說明
              <textarea v-model="freePrint.note" maxlength="2000" />
            </label>
            <label class="checkbox wide">
              <input v-model="freePrint.termsAccepted" type="checkbox" required />
              我了解需由站點審核，並同意使用單色 3DSTU_PETG。
            </label>
            <button class="solid" :disabled="busy">送出免費列印申請</button>
          </form>
          <router-link to="/free-print/nthu-shuimu/slicer">先試用站點線上切片 ↗</router-link>
        </section>
        <section class="hub-panel">
          <h2>免費列印紀錄</h2>
          <article v-for="item in freeRequests" :key="item.id" class="service-record">
            <div class="panel-top">
              <h3>{{ item.stationName }}</h3>
              <span class="status-chip">{{ status(item.status) }}</span>
            </div>
            <p>{{ item.material }} · 申請於 {{ date(item.createdAt) }}</p>
            <p v-if="item.pickupCode" class="pickup-code">取件碼：{{ item.pickupCode }}</p>
            <p v-for="reply in item.replies" :key="reply.id">站點回覆：{{ reply.body }}</p>
          </article>
          <p v-if="!freeRequests.length">尚無免費列印申請紀錄。</p>
        </section>
      </template>
    </template>
  </div>
</template>

<script setup>
  import { computed, onMounted, onBeforeUnmount, ref, reactive, watch } from 'vue'
  import { useRoute, useRouter } from 'vue-router'
  import { useStore } from 'vuex'
  import customerRequest from '@/utils/customerRequest'
  import ModelViewer from '@/components/ModelViewer.vue'
  import { workspace, uploadWorkspace, modelFile } from '@/api/memberWorkspace'
  import { fetchMyCases, decideCase } from '@/api/customerPortal'
  import { portalMoney as money, portalStatus, trackingPortal } from '@/utils/portal-presentation.mjs'
  const route = useRoute(),
    router = useRouter(),
    store = useStore()
  const titles = {
    models: '我的模型',
    drafts: '雲端草稿',
    projects: '專案協作',
    case: '案件詳情',
    notifications: '通知中心',
    settings: '帳號設定',
    billing: '付款與單據',
    rewards: '點數與優惠',
    support: '服務與售後',
    'free-print': '免費列印',
  }
  const navigation = Object.entries(titles)
    .filter(([id]) => id !== 'case')
    .map(([id, label]) => ({ id, label }))
  const section = computed(() => (titles[route.query.section] ? route.query.section : 'models'))
  const data = ref(null),
    loading = ref(false),
    busy = ref(false),
    error = ref(''),
    notice = ref('')
  const search = ref(''),
    modelFilter = ref('active'),
    projectFilter = ref(''),
    previewData = ref(null),
    caseDetail = ref(null),
    projectDetail = ref(null),
    cases = ref([]),
    sessions = ref([]),
    invitations = ref([])
  const inviteEmails = reactive({}),
    messageText = ref(''),
    deletionPassword = ref(''),
    requestPhotos = ref([])
  const profile = reactive({
    name: '',
    phone: '',
    company: '',
    school: '',
    department: '',
    billingTitle: '',
    taxId: '',
    notifications: { email: true, line: false },
  })
  const password = reactive({ currentPassword: '', newPassword: '', confirm: '' }),
    projectForm = reactive({ name: '', type: 'personal', reference: '' })
  const requestForm = reactive({ type: 'defect', caseId: route.query.caseId || '', orderId: '', note: '' })
  const freePrint = reactive({ stationId: 'nthu-shuimu', draftId: '', note: '', termsAccepted: false }),
    billing = reactive({ orders: [] }),
    rewards = reactive({ balance: 0, entries: [], coupons: [] })
  const requestTypes = {
    cancellation: '取消申請',
    reprint: '補印申請',
    defect: '品質問題',
    delivery: '交付問題',
    refund: '退款申請',
    other: '其他問題',
    account_deletion: '帳號刪除',
  }
  const unread = computed(() => data.value?.notifications.filter((n) => !n.readAt).length || 0)
  const ownProjects = computed(() => data.value?.projects.filter((p) => p.isOwner) || [])
  const filteredModels = computed(() =>
    (data.value?.models || []).filter(
      (m) =>
        (modelFilter.value === 'archived' ? !!m.archivedAt : !m.archivedAt) &&
        (modelFilter.value !== 'favorites' || m.favorite) &&
        (!projectFilter.value || m.projectId === projectFilter.value) &&
        m.name.toLowerCase().includes(search.value.toLowerCase())
    )
  )
  const serviceRequests = computed(() => data.value?.requests.filter((r) => r.type !== 'free_print') || []),
    freeRequests = computed(() => data.value?.requests.filter((r) => r.type === 'free_print') || [])
  const status = (value) => ({ approved: '已通過', ready_for_pickup: '可取件', confirmed: '已確認' }[value] || portalStatus(value))
  const date = (value) =>
    value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '待確認'
  const size = (value) =>
    Number(value || 0) < 1024 * 1024
      ? `${(Number(value || 0) / 1024).toFixed(1)} KB`
      : `${(Number(value || 0) / 1024 / 1024).toFixed(2)} MB`
  const caseLink = (id) => ({ path: '/portal/workspace', query: { section: 'case', id } })
  async function action(fn, message = '已儲存') {
    if (busy.value) return
    busy.value = true
    error.value = ''
    notice.value = ''
    try {
      await fn()
      notice.value = message
    } catch (err) {
      error.value = err.response?.data?.error || err.message || '操作未完成，請重試'
    } finally {
      busy.value = false
    }
  }
  async function load() {
    loading.value = true
    error.value = ''
    try {
      data.value = await workspace()
      store.commit('customerAuth/setCustomer', data.value.customer)
      Object.assign(profile, {
        ...data.value.preferences,
        ...data.value.customer,
        notifications: { ...data.value.preferences.notifications },
      })
      await loadSection()
    } catch (err) {
      error.value = err.response?.data?.error || '無法載入會員工作台'
    } finally {
      loading.value = false
    }
  }
  async function loadSection() {
    caseDetail.value = null
    projectDetail.value = null
    if (section.value === 'case' && route.query.id) caseDetail.value = await workspace(`/cases/${encodeURIComponent(route.query.id)}`)
    if (section.value === 'settings') sessions.value = (await workspace('/sessions')).sessions
    if (section.value === 'projects') invitations.value = (await workspace('/invitations')).invitations
    if (section.value === 'billing') Object.assign(billing, await workspace('/billing'))
    if (section.value === 'rewards') Object.assign(rewards, await workspace('/rewards'))
    if (section.value === 'support') {
      cases.value = (await fetchMyCases()).cases || []
      requestForm.caseId = route.query.caseId || requestForm.caseId
    }
  }
  watch(
    () => route.fullPath,
    () => {
      error.value = ''
      notice.value = ''
      if (data.value) action(loadSection, '')
    }
  )
  onMounted(async () => {
    await load()
    if (route.query.confirmOrder && route.query.transactionId)
      await action(async () => {
        await customerRequest({
          url: '/api/customer/payments/linepay/confirm',
          method: 'post',
          data: { orderId: route.query.confirmOrder, transactionId: route.query.transactionId },
        })
        await router.replace({ path: '/portal/workspace', query: { section: 'billing' } })
        await load()
      }, '付款已驗證完成')
  })
  let refreshTimer = window.setInterval(refreshReadOnly, 30000)
  window.addEventListener('focus', refreshReadOnly)
  async function refreshReadOnly() {
    if (document.hidden || busy.value || loading.value || !['notifications', 'case', 'support', 'free-print'].includes(section.value))
      return
    const path = route.fullPath
    try {
      const result = await workspace()
      if (route.fullPath !== path) return
      data.value = result
      if (section.value === 'case' && route.query.id) caseDetail.value = await workspace(`/cases/${encodeURIComponent(route.query.id)}`)
    } catch {
      error.value = '進度更新暫時中斷，可按重新整理再試。'
    }
  }
  onBeforeUnmount(() => {
    clearInterval(refreshTimer)
    window.removeEventListener('focus', refreshReadOnly)
  })
  async function uploadModel(event, parentId) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file) return
    await action(async () => {
      await uploadWorkspace('/models', { ...(parentId ? { parentId } : {}), projectId: projectFilter.value }, [file])
      await load()
    }, '模型已保存')
  }
  async function updateModel(model, payload) {
    await action(async () => {
      await workspace(`/models/${model.id}`, 'patch', payload)
      await load()
    }, '模型資料已更新')
  }
  async function preview(model) {
    await action(async () => {
      previewData.value = { name: model.name, buffer: await modelFile(model.id) }
    }, '')
  }
  function saveFile(bytes, name, type = 'application/octet-stream') {
    const url = URL.createObjectURL(new Blob([bytes], { type }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  async function downloadModel(model) {
    await action(async () => saveFile(await modelFile(model.id), model.name), '模型已下載')
  }
  async function deleteDraft(draft) {
    if (!window.confirm(`刪除「${draft.name}」草稿？模型版本仍保留在模型庫。`)) return
    await action(async () => {
      await workspace(`/drafts/${draft.id}`, 'delete')
      await load()
    }, '草稿已刪除，模型仍保留')
  }
  async function createProject() {
    await action(async () => {
      await workspace('/projects', 'post', projectForm)
      projectForm.name = ''
      await load()
    }, '專案已建立')
  }
  async function invite(id) {
    await action(() => workspace(`/projects/${id}/invitations`, 'post', { email: inviteEmails[id] }), '邀請已送出')
  }
  async function acceptInvite(id) {
    await action(async () => {
      await workspace(`/projects/${id}/accept`, 'post', {})
      await load()
    }, '已加入專案')
  }
  async function removeMember(id, member) {
    await action(async () => {
      await workspace(`/projects/${id}/members/${member}`, 'delete')
      await load()
    }, '已移除檢視權限')
  }
  async function openProject(id) {
    await action(async () => {
      projectDetail.value = await workspace(`/projects/${id}`)
    }, '')
  }
  async function sharedDownload(model) {
    await action(
      async () =>
        saveFile(
          await workspace(`/projects/${projectDetail.value.project.id}/models/${model.id}/file`, 'get', undefined, {
            responseType: 'arraybuffer',
          }),
          model.name
        ),
      '共用模型已下載'
    )
  }
  async function sendMessage() {
    await action(async () => {
      await workspace(`/cases/${route.query.id}/messages`, 'post', { body: messageText.value })
      messageText.value = ''
      await loadSection()
    }, '訊息已送出')
  }
  async function caseDecision(decision) {
    await action(async () => {
      await decideCase(route.query.id, decision)
      await loadSection()
    }, '回覆已送出')
  }
  async function createCheckoutOrder() {
    await action(async () => {
      await workspace(`/cases/${route.query.id}/checkout-order`, 'post', {})
      await router.push('/portal/dashboard?tab=orders')
    }, '訂單已建立')
  }
  async function markRead(id) {
    await action(async () => {
      await workspace('/notifications', 'patch', id ? { id } : {})
      data.value.notifications.forEach((n) => {
        if (!id || n.id === id) n.readAt = new Date().toISOString()
      })
    }, '')
  }
  async function reorderCase() {
    await action(async () => {
      const result = await workspace(`/cases/${route.query.id}/reorder-draft`, 'post', {})
      await router.push({ path: '/quote', query: { draft: result.draft.id } })
    }, '')
  }
  async function saveSettings() {
    await action(async () => {
      await workspace('/preferences', 'patch', {
        name: profile.name,
        phone: profile.phone,
        company: profile.company,
        school: profile.school,
        department: profile.department,
        billingTitle: profile.billingTitle,
        taxId: profile.taxId,
        notifications: profile.notifications,
      })
      await load()
    }, '會員資料已更新')
  }
  async function changePassword() {
    if (password.newPassword !== password.confirm) {
      error.value = '兩次新密碼不一致'
      return
    }
    await action(async () => {
      await workspace('/password', 'post', { currentPassword: password.currentPassword, newPassword: password.newPassword })
      Object.assign(password, { currentPassword: '', newPassword: '', confirm: '' })
      await loadSection()
    }, '密碼已更新，其他登入已登出')
  }
  async function revokeSession(session) {
    await action(async () => {
      await workspace(`/sessions/${session.id}`, 'delete')
      if (session.current) {
        await store.dispatch('customerAuth/resetAccessToken')
        await router.push('/portal/login')
      } else await loadSection()
    }, '已登出指定工作階段')
  }
  async function requestDeletion() {
    if (!window.confirm('送出帳號與個人資料刪除申請？專員將確認交易與資料保留事項。')) return
    await action(async () => {
      await workspace('/deletion-request', 'post', { password: deletionPassword.value })
      deletionPassword.value = ''
      await load()
    }, '刪除申請已送出')
  }
  async function submitRequest() {
    await action(async () => {
      if (requestPhotos.value.length > 3 || requestPhotos.value.some((f) => f.size > 5 * 1024 * 1024))
        throw new Error('最多三張照片，每張上限 5 MB')
      const payload = {
        type: requestForm.type,
        note: requestForm.note,
        ...(requestForm.caseId ? { caseId: requestForm.caseId } : { orderId: requestForm.orderId }),
      }
      await uploadWorkspace('/requests', payload, requestPhotos.value)
      requestForm.note = ''
      requestPhotos.value = []
      await load()
    }, '已收到申請，等待專員確認')
  }
  async function applyFreePrint() {
    await action(async () => {
      await workspace('/free-print', 'post', freePrint)
      await load()
    }, '免費列印申請已送出，等待站點審核')
  }
  async function downloadAttachment(item, attachment) {
    await action(
      async () =>
        saveFile(
          await workspace(`/requests/${item.id}/attachments/${attachment.id}`, 'get', undefined, { responseType: 'arraybuffer' }),
          attachment.name
        ),
      '附件已下載'
    )
  }
  async function downloadDocument(doc) {
    await action(
      async () =>
        saveFile(await workspace(`/documents/issued/${doc.id}`, 'get', undefined, { responseType: 'arraybuffer' }), `${doc.title}.pdf`),
      '單據已下載'
    )
  }
  async function printDocument(kind, id) {
    await action(async () => {
      const document = await workspace(`/documents/${kind}/${id}`)
      saveFile(JSON.stringify(document, null, 2), `${document.reference}-${kind}.json`, 'application/json')
      const popup = window.open('', '_blank')
      if (popup) {
        popup.document.title = document.title
        const main = popup.document.createElement('main')
        for (const line of [
          document.title,
          `編號：${document.reference}`,
          document.project,
          document.customerName,
          document.billingTitle,
          document.taxId,
          document.quote ? `報價總額：${money(document.quote.total)}` : `付款金額：${money(document.amount)}`,
          document.quote?.scope,
          document.notice,
        ]) {
          if (!line) continue
          const p = popup.document.createElement('p')
          p.textContent = line
          main.append(p)
        }
        popup.document.body.append(main)
        popup.print()
      }
    }, '文件已下載；列印視窗可另存 PDF')
  }
</script>

<style scoped>
  .member-hub {
    max-width: 1100px;
    margin: auto;
    color: #183d34;
    overflow-wrap: anywhere;
  }
  .hub-heading,
  .panel-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .hub-heading {
    margin-bottom: 28px;
  }
  .hub-heading h1 {
    font-size: clamp(28px, 4vw, 40px);
    letter-spacing: -1px;
    margin: 8px 0;
  }
  .hub-heading p,
  .hub-panel > p {
    color: #65716c;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 2px;
  }
  .hub-nav {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 26px;
  }
  .hub-nav a {
    padding: 7px 12px;
    border: 1px solid #dce2db;
    border-radius: 30px;
    font-size: 12px;
    background: #fff;
  }
  .hub-nav a[aria-current='page'] {
    background: #214b3d;
    color: white;
    border-color: #214b3d;
  }
  .hub-nav span {
    display: inline-block;
    min-width: 18px;
    background: #cba25b;
    color: #183d34;
    border-radius: 20px;
    text-align: center;
  }
  .hub-panel {
    padding: 28px;
    background: #fff;
    border: 1px solid #dce2db;
    border-radius: 10px;
    margin-bottom: 20px;
  }
  .hub-panel h2 {
    font-size: 20px;
    margin: 0 0 12px;
  }
  .hub-panel h3 {
    font-size: 15px;
    margin: 16px 0 8px;
  }
  .hub-panel p {
    font-size: 13px;
    line-height: 1.8;
  }
  .member-hub button,
  .member-hub .solid,
  .upload-button {
    padding: 10px 15px;
    background: #fff;
    border: 1px solid #cdd7cc;
    border-radius: 5px;
    color: #183d34;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    display: inline-block;
  }
  .member-hub .solid,
  .upload-button {
    background: #214b3d;
    border-color: #214b3d;
    color: white;
  }
  .member-hub button:disabled {
    opacity: 0.45;
    cursor: wait;
  }
  .member-hub label {
    display: grid;
    gap: 7px;
    font-size: 12px;
  }
  .member-hub input,
  .member-hub select,
  .member-hub textarea {
    min-width: 0;
    max-width: 100%;
    width: 100%;
    border: 1px solid #cdd7cc;
    background: #fbfcf9;
    border-radius: 5px;
    padding: 10px 12px;
    font: inherit;
    color: inherit;
    box-sizing: border-box;
  }
  .member-hub input:focus,
  .member-hub textarea:focus,
  .member-hub select:focus {
    outline: 2px solid #658e78;
    outline-offset: 2px;
  }
  .member-hub textarea {
    resize: vertical;
  }
  .member-hub .checkbox {
    display: flex;
    align-items: center;
    gap: 9px;
    margin: 12px 0;
  }
  .checkbox input {
    width: auto;
  }
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    align-items: end;
    margin: 20px 0;
  }
  .form-grid button {
    justify-self: start;
  }
  .wide {
    grid-column: 1/-1;
  }
  .inline-form,
  .filter-row {
    display: flex;
    align-items: end;
    gap: 12px;
    flex-wrap: wrap;
    margin: 18px 0;
  }
  .inline-form label {
    flex: 1;
    min-width: 160px;
  }
  .filter-row label {
    flex: 1;
    min-width: 140px;
  }
  .model-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .model-card {
    background: #f7f8f3;
    border: 1px solid #dce2db;
    border-radius: 7px;
    padding: 20px;
    min-width: 0;
  }
  .model-index {
    letter-spacing: 2px;
    color: #8a7549;
    font-size: 10px !important;
  }
  .model-card label {
    margin-top: 12px;
  }
  .upload-button input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .upload-button:focus-within {
    outline: 3px solid #a57629;
    outline-offset: 4px;
  }
  .version-upload input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .file-upload {
    position: relative;
    display: block;
  }
  .file-upload input {
    position: absolute;
    opacity: 0;
    width: 1px;
    height: 1px;
  }
  .file-choice {
    display: inline-block;
    border: 1px solid #cdd7cc;
    border-radius: 5px;
    padding: 10px 12px;
    background: #fff;
    cursor: pointer;
  }
  .version-upload:focus-within .file-choice,
  .file-upload:focus-within .file-choice {
    outline: 2px solid #658e78;
    outline-offset: 2px;
  }
  .card-actions {
    display: flex;
    gap: 9px;
    flex-wrap: wrap;
    align-items: center;
  }
  .card-actions > a {
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .record-row {
    padding: 18px 0;
    border-bottom: 1px solid #e5e8e1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 18px;
  }
  .record-row:last-child {
    border-bottom: 0;
  }
  .record-row h3 {
    margin-top: 0;
  }
  .record-row small {
    display: block;
    color: #65716c;
    margin-top: 6px;
  }
  .hub-empty {
    text-align: center;
    padding: 50px 20px;
  }
  .hub-empty a {
    text-decoration: underline;
  }
  .hub-error,
  .hub-notice {
    padding: 13px 18px;
    border-radius: 5px;
    background: #f9e8e3;
    color: #8c362b;
    font-size: 13px;
  }
  .hub-notice {
    background: #e8f1e7;
    color: #245c48;
  }
  .hub-panel .small,
  small {
    font-size: 11px;
    color: #65716c;
  }
  .status-chip {
    padding: 6px 12px;
    border-radius: 30px;
    background: #edf2e8;
    font-size: 12px;
  }
  .case-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-block: 1px solid #e5e8e1;
    margin: 24px 0;
    padding: 20px 0;
    gap: 15px;
  }
  .case-facts span {
    display: block;
    font-size: 11px;
    color: #65716c;
  }
  .case-facts strong {
    font-size: 17px;
  }
  .case-timeline {
    padding-left: 20px;
  }
  .case-timeline li {
    padding: 8px;
    font-size: 13px;
  }
  .case-timeline time {
    margin-left: 15px;
    color: #65716c;
    font-size: 11px;
  }
  .conversation {
    padding: 16px;
    background: #f5f6f0;
    border-radius: 6px;
    margin: 12px 0;
  }
  .conversation.staff {
    border-left: 3px solid #a9874d;
  }
  .conversation time {
    float: right;
    font-size: 11px;
    color: #65716c;
  }
  .conversation p,
  .service-record p {
    white-space: pre-wrap;
  }
  .project-row,
  .service-record {
    padding: 20px 0;
    border-bottom: 1px solid #e5e8e1;
  }
  .service-reply {
    padding: 12px;
    background: #eff3eb;
    border-left: 3px solid #a9874d;
  }
  .notification.unread {
    border-left: 3px solid #ae8a49;
    padding-left: 16px;
  }
  .station-panel {
    background: #eff2e8;
  }
  .pickup-code {
    font-size: 24px !important;
    font-weight: 700;
    letter-spacing: 3px;
  }
  .preview-panel {
    margin-top: 24px;
    border-top: 1px solid #dce2db;
    padding-top: 24px;
  }
  @media (max-width: 760px) {
    .hub-heading,
    .panel-top {
      align-items: start;
      flex-wrap: wrap;
    }
    .hub-panel {
      padding: 20px;
    }
    .model-grid {
      grid-template-columns: 1fr;
    }
    .record-row {
      flex-wrap: wrap;
    }
    .case-facts {
      grid-template-columns: 1fr;
    }
    .hub-nav {
      gap: 6px;
    }
    .hub-nav a {
      padding: 7px 9px;
      font-size: 11px;
    }
    .form-grid {
      grid-template-columns: 1fr;
    }
    .hub-heading > .solid {
      font-size: 12px;
    }
    .conversation time {
      float: none;
      display: block;
      margin-top: 5px;
    }
    .member-hub button {
      max-width: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    * {
      scroll-behavior: auto;
    }
  }
</style>
