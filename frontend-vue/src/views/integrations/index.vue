<template>
  <div class="integrations-container">
    <el-tabs v-model="tab">
      <el-tab-pane label="硬體橋接" name="bridges">
        <p class="hint">將打印機連上 OctoPrint / Moonraker / PrusaLink，讓後端能直接下發控制指令。</p>
        <div class="quickbar">
          <el-button v-permissions="['printers:control']" type="primary" icon="el-icon-circle-plus" @click="bridgeDialogVisible = true" :disabled="!printers.length">新增橋接</el-button>
        </div>
        <el-table :data="bridges" style="width: 100%">
          <el-table-column prop="name" label="名稱" min-width="140" />
          <el-table-column prop="kind" label="類型" width="120" />
          <el-table-column prop="baseUrl" label="位址" min-width="180" />
          <el-table-column label="狀態" width="120">
            <template slot-scope="{ row }"><el-tag size="mini">{{ row.lastStatus || 'not tested' }}</el-tag></template>
          </el-table-column>
          <el-table-column label="操作" width="100" v-permissions="['printers:control']">
            <template slot-scope="{ row }">
              <el-button size="mini" :loading="testBusy === row.id" @click="testBridgeConn(row)">測試</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!bridges.length" class="empty-hint">尚無橋接設定</div>
      </el-tab-pane>

      <el-tab-pane label="Webhook" name="webhooks">
        <div class="quickbar">
          <el-button v-permissions="['webhooks:write']" type="primary" icon="el-icon-circle-plus" @click="webhookDialogVisible = true">新增 Webhook</el-button>
        </div>
        <el-table :data="webhooks" style="width: 100%">
          <el-table-column prop="name" label="名稱" min-width="140" />
          <el-table-column prop="url" label="URL" min-width="200" />
          <el-table-column label="啟用" width="90">
            <template slot-scope="{ row }">
              <el-switch v-model="row.enabled" :disabled="!canWebhooks" @change="toggleWebhook(row)" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100" v-permissions="['webhooks:write']">
            <template slot-scope="{ row }">
              <el-button size="mini" :loading="testWebhookBusy === row.id" @click="testWebhookConn(row)">測試</el-button>
            </template>
          </el-table-column>
        </el-table>
        <div v-if="!webhooks.length" class="empty-hint">尚無 Webhook 設定</div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog title="新增橋接" :visible.sync="bridgeDialogVisible" width="420px">
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
      <div slot="footer">
        <el-button @click="bridgeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingBridge" @click="submitBridge">儲存</el-button>
      </div>
    </el-dialog>

    <el-dialog title="新增 Webhook" :visible.sync="webhookDialogVisible" width="420px">
      <el-form label-width="90px" size="small">
        <el-form-item label="名稱"><el-input v-model="webhookForm.name" /></el-form-item>
        <el-form-item label="URL"><el-input v-model="webhookForm.url" placeholder="https://..." /></el-form-item>
        <el-form-item label="事件"><el-input v-model="webhookForm.eventsText" placeholder="以逗號分隔，例如 *" /></el-form-item>
      </el-form>
      <div slot="footer">
        <el-button @click="webhookDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingWebhook" @click="submitWebhook">新增</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { fetchState } from '@/api/realtime'
  import { createBridge, testBridge, createWebhook, updateWebhook, testWebhook } from '@/api/integrations'

  export default {
    name: 'Integrations',
    data() {
      return {
        tab: 'bridges',
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
      async submitWebhook() {
        if (!this.webhookForm.name.trim() || !this.webhookForm.url.trim()) {
          this.$baseMessage('請填寫名稱與 URL', 'warning')
          return
        }
        this.savingWebhook = true
        try {
          const events = this.webhookForm.eventsText.split(',').map((s) => s.trim()).filter(Boolean)
          const webhook = await createWebhook({ name: this.webhookForm.name, url: this.webhookForm.url, events: events.length ? events : ['*'] })
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
</style>
