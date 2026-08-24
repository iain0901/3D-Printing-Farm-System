<template>
  <div class="notifications-container">
    <div class="quickbar">
      <el-button v-permissions="['notifications:write']" type="primary" icon="CirclePlus" @click="dialogVisible = true">新增通知管道</el-button>
    </div>
    <el-table :data="channels" style="width: 100%">
      <el-table-column prop="name" label="名稱" min-width="140" />
      <el-table-column prop="type" label="類型" width="100" />
      <el-table-column prop="url" label="URL" min-width="220" />
      <el-table-column label="啟用" width="90">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" v-permissions="['notifications:write']" @change="toggle(row)" />
        </template>
      </el-table-column>
      <el-table-column label="狀態" width="110">
        <template #default="{ row }"><el-tag size="small">{{ row.lastStatus || 'not sent' }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="100" v-permissions="['notifications:write']">
        <template #default="{ row }">
          <el-button size="small" :loading="testBusy === row.id" @click="test(row)">測試</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div v-if="!channels.length" class="empty-hint">尚無通知管道</div>

    <el-dialog title="新增通知管道" v-model="dialogVisible" width="420px">
      <el-form label-width="80px" size="small">
        <el-form-item label="名稱"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="類型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option label="Slack" value="slack" />
            <el-option label="Discord" value="discord" />
            <el-option label="Email" value="email" />
            <el-option label="自訂" value="custom" />
          </el-select>
        </el-form-item>
        <el-form-item label="URL"><el-input v-model="form.url" placeholder="https://..." /></el-form-item>
        <el-form-item label="事件"><el-input v-model="form.eventsText" placeholder="以逗號分隔，例如 *" /></el-form-item>
      </el-form>
      <template #footer><div>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">新增</el-button>
      </div></template>
    </el-dialog>
  </div>
</template>

<script>
  import { fetchState } from '@/api/realtime'
  import { createNotificationChannel, updateNotificationChannel, testNotificationChannel } from '@/api/notifications'

  export default {
    name: 'Notifications',
    data() {
      return {
        channels: [],
        testBusy: '',
        dialogVisible: false,
        saving: false,
        form: { name: '', type: 'slack', url: '', eventsText: '*' },
      }
    },
    created() {
      this.load()
    },
    methods: {
      async load() {
        const data = await fetchState()
        this.channels = data.notificationChannels || []
      },
      async toggle(row) {
        await updateNotificationChannel(row.id, { enabled: row.enabled })
      },
      async test(row) {
        this.testBusy = row.id
        try {
          await testNotificationChannel(row.id)
          this.$baseMessage('測試通知已送出', 'success')
        } finally {
          this.testBusy = ''
        }
      },
      async submit() {
        if (!this.form.name.trim() || !this.form.url.trim()) {
          this.$baseMessage('請填寫名稱與 URL', 'warning')
          return
        }
        this.saving = true
        try {
          const events = this.form.eventsText.split(',').map((s) => s.trim()).filter(Boolean)
          const channel = await createNotificationChannel({ name: this.form.name, type: this.form.type, url: this.form.url, events: events.length ? events : ['*'] })
          this.channels.push(channel)
          this.$baseMessage('通知管道已新增', 'success')
          this.dialogVisible = false
        } finally {
          this.saving = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .notifications-container {
    padding: 20px;
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
