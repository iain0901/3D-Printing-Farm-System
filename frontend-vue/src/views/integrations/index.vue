<template>
  <div class="integrations-container">
    <el-tabs v-model="tab">
      <el-tab-pane label="硬體橋接" name="bridges">
        <p class="hint">將打印機連上 OctoPrint / Moonraker / PrusaLink，讓後端能直接下發控制指令。</p>
        <div class="quickbar">
          <el-button
            v-permissions="['printers:control']"
            type="primary"
            icon="CirclePlus"
            :disabled="!printers.length"
            @click="bridgeDialogVisible = true"
          >
            新增橋接
          </el-button>
        </div>
        <el-table :data="bridges" style="width: 100%">
          <el-table-column prop="name" label="名稱" min-width="140" />
          <el-table-column prop="kind" label="類型" width="120" />
          <el-table-column prop="baseUrl" label="位址" min-width="180" />
          <el-table-column label="狀態" width="120">
            <template #default="{ row }">
              <el-tag size="small">{{ row.lastStatus || 'not tested' }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column v-permissions="['printers:control']" label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" :loading="testBusy === row.id" @click="testBridgeConn(row)">測試</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!bridges.length" class="empty-hint">尚無橋接設定</div>
      </el-tab-pane>

      <el-tab-pane label="Webhook" name="webhooks">
        <div class="quickbar">
          <el-button v-permissions="['webhooks:write']" type="primary" icon="CirclePlus" @click="webhookDialogVisible = true">
            新增 Webhook
          </el-button>
        </div>
        <el-table :data="webhooks" style="width: 100%">
          <el-table-column prop="name" label="名稱" min-width="140" />
          <el-table-column prop="url" label="URL" min-width="200" />
          <el-table-column label="啟用" width="90">
            <template #default="{ row }">
              <el-switch v-model="row.enabled" :disabled="!canWebhooks" @change="toggleWebhook(row)" />
            </template>
          </el-table-column>
          <el-table-column v-permissions="['webhooks:write']" label="操作" width="100">
            <template #default="{ row }">
              <el-button size="small" :loading="testWebhookBusy === row.id" @click="testWebhookConn(row)">測試</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!webhooks.length" class="empty-hint">尚無 Webhook 設定</div>
      </el-tab-pane>

      <el-tab-pane label="Chatwoot 與 AI" name="chatwoot">
        <p class="hint">LINE 客戶對話持續保留在既有 Chatwoot；此處只確認案件側欄、AI 路由與團隊知識庫是否可用。</p>
        <el-descriptions v-if="chatwootStatus" :column="1" border size="small" class="chatwoot-status">
          <el-descriptions-item label="Chatwoot API">
            <el-tag :type="chatwootStatus.chatwoot.configured ? 'success' : 'warning'">
              {{ chatwootStatus.chatwoot.configured ? '已設定' : '未設定' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="AI 引擎">
            <el-tag :type="chatwootStatus.ai.configured ? 'success' : 'info'">
              {{ chatwootStatus.ai.configured ? `${chatwootStatus.ai.provider} 已設定` : '未設定，將轉人工' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="預設模式">{{ chatwootStatus.ai.defaultMode }}</el-descriptions-item>
          <el-descriptions-item label="啟用知識條目">{{ chatwootStatus.knowledgeEntries }}</el-descriptions-item>
          <el-descriptions-item label="最近連線測試">
            <span :class="chatwootHealth && !chatwootHealth.ok ? 'failed' : ''">
              {{ chatwootHealth ? (chatwootHealth.ok ? '成功' : chatwootHealth.error || '尚未成功') : '尚未測試' }}
            </span>
          </el-descriptions-item>
        </el-descriptions>
        <div class="quickbar">
          <el-button :loading="testingChatwoot" @click="testChatwoot">測試 Chatwoot 連線</el-button>
          <el-button type="primary" @click="$router.push('/ai-knowledge/index')">管理 AI 知識庫</el-button>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="bridgeDialogVisible" title="新增橋接" width="420px">
      <el-form label-width="90px" size="small">
        <el-form-item label="打印機">
          <el-select v-model="bridgeForm.printerId" style="width: 100%">
            <el-option v-for="p in printers" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="類型">
          <el-select v-model="bridgeForm.kind" style="width: 100%">
            <el-option label="OctoPrint" value="octoprint" />
            <el-option label="Moonraker" value="moonraker" />
            <el-option label="PrusaLink" value="prusalink" />
            <el-option label="手動" value="manual" />
          </el-select>
        </el-form-item>
        <el-form-item label="名稱"><el-input v-model="bridgeForm.name" /></el-form-item>
        <el-form-item label="位址"><el-input v-model="bridgeForm.baseUrl" placeholder="http://..." /></el-form-item>
        <el-form-item label="API Key"><el-input v-model="bridgeForm.apiKey" /></el-form-item>
      </el-form>
      <template #footer>
        <div>
          <el-button @click="bridgeDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingBridge" @click="submitBridge">儲存</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog v-model="webhookDialogVisible" title="新增 Webhook" width="420px">
      <el-form label-width="90px" size="small">
        <el-form-item label="名稱"><el-input v-model="webhookForm.name" /></el-form-item>
        <el-form-item label="URL"><el-input v-model="webhookForm.url" placeholder="https://..." /></el-form-item>
        <el-form-item label="事件"><el-input v-model="webhookForm.eventsText" placeholder="以逗號分隔，例如 *" /></el-form-item>
      </el-form>
      <template #footer>
        <div>
          <el-button @click="webhookDialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="savingWebhook" @click="submitWebhook">新增</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { fetchState } from '@/api/realtime'
  import {
    createBridge,
    testBridge,
    createWebhook,
    updateWebhook,
    testWebhook,
    fetchChatwootStatus,
    testChatwootHealth,
  } from '@/api/integrations'

  export default {
    name: 'Integrations',
    data() {
      return {
        tab: 'bridges',
        chatwootStatus: null,
        chatwootHealth: null,
        testingChatwoot: false,
        bridges: [],
        webhooks: [],
        testBusy: '',
        testWebhookBusy: '',
        bridgeDialogVisible: false,
        savingBridge: false,
        bridgeForm: { printerId: '', kind: 'octoprint', name: '', baseUrl: '', apiKey: '' },
        webhookDialogVisible: false,
        savingWebhook: false,
        webhookForm: { name: '', url: '', eventsText: '*' },
      }
    },
    computed: {
      ...mapGetters({ printers: 'printers/list', permissions: 'user/permissions' }),
      canWebhooks() {
        return this.permissions.includes('*') || this.permissions.includes('webhooks:write')
      },
    },
    created() {
      this.load()
      if (this.printers.length) this.bridgeForm.printerId = this.printers[0].id
    },
    methods: {
      async load() {
        const data = await fetchState()
        this.bridges = data.bridges || []
        this.webhooks = data.webhooks || []
        this.chatwootStatus = await fetchChatwootStatus()
      },
      async testBridgeConn(row) {
        this.testBusy = row.id
        try {
          const result = await testBridge(row.id)
          const index = this.bridges.findIndex((b) => b.id === row.id)
          if (index !== -1) this.bridges.splice(index, 1, result.bridge)
          this.$baseMessage(result.ok ? '連線測試成功' : '連線測試失敗', result.ok ? 'success' : 'error')
        } finally {
          this.testBusy = ''
        }
      },
      async submitBridge() {
        if (!this.bridgeForm.name.trim() || !this.bridgeForm.baseUrl.trim()) {
          this.$baseMessage('請填寫名稱與位址', 'warning')
          return
        }
        this.savingBridge = true
        try {
          const bridge = await createBridge(this.bridgeForm)
          const index = this.bridges.findIndex((b) => b.printerId === bridge.printerId)
          if (index !== -1) this.bridges.splice(index, 1, bridge)
          else this.bridges.push(bridge)
          this.$baseMessage('橋接已儲存', 'success')
          this.bridgeDialogVisible = false
        } finally {
          this.savingBridge = false
        }
      },
      async toggleWebhook(row) {
        await updateWebhook(row.id, { enabled: row.enabled })
      },
      async testWebhookConn(row) {
        this.testWebhookBusy = row.id
        try {
          await testWebhook(row.id)
          this.$baseMessage('測試通知已送出', 'success')
        } finally {
          this.testWebhookBusy = ''
        }
      },
      async testChatwoot() {
        this.testingChatwoot = true
        try {
          this.chatwootHealth = await testChatwootHealth()
          this.$baseMessage(
            this.chatwootHealth.ok ? 'Chatwoot 連線測試成功' : 'Chatwoot 尚未完成設定',
            this.chatwootHealth.ok ? 'success' : 'warning'
          )
        } catch (error) {
          this.chatwootHealth = error?.response?.data || { ok: false, error: 'Chatwoot health check failed' }
          this.$baseMessage('Chatwoot 連線測試失敗', 'error')
        } finally {
          this.testingChatwoot = false
        }
      },
      async submitWebhook() {
        if (!this.webhookForm.name.trim() || !this.webhookForm.url.trim()) {
          this.$baseMessage('請填寫名稱與 URL', 'warning')
          return
        }
        this.savingWebhook = true
        try {
          const events = this.webhookForm.eventsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
          const webhook = await createWebhook({
            name: this.webhookForm.name,
            url: this.webhookForm.url,
            events: events.length ? events : ['*'],
          })
          this.webhooks.push(webhook)
          this.$baseMessage('Webhook 已新增', 'success')
          this.webhookDialogVisible = false
        } finally {
          this.savingWebhook = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .integrations-container {
    padding: 20px;
  }

  .hint {
    color: $base-color-gray;
    font-size: 13px;
  }

  .quickbar {
    margin-bottom: 12px;
  }

  .empty-hint {
    color: $base-color-gray;
    padding: 20px 0;
    text-align: center;
  }
  .chatwoot-status {
    margin-bottom: 16px;
    max-width: 680px;
  }
  .failed {
    color: #f56c6c;
  }
</style>
