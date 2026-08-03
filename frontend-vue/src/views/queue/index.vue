<template>
  <div class="queue-container">
    <div class="quickbar">
      <el-button v-permissions="['queue:write']" :loading="matching === 'dry'" @click="preview" icon="el-icon-view">預覽配對</el-button>
      <el-button v-permissions="['queue:write']" type="primary" :loading="matching === 'commit'" @click="commitMatch" icon="el-icon-connection">立即配對</el-button>
      <span v-if="lastMatch" class="quickbar-note">上次配對：{{ lastMatch.matches.length }} 筆已配對，{{ lastMatch.skipped.length }} 筆略過</span>
    </div>

    <el-table :data="queue" style="width: 100%">
      <el-table-column prop="file" label="檔案" min-width="160" />
      <el-table-column prop="printer" label="打印機" width="140" />
      <el-table-column label="狀態" width="150">
        <template slot-scope="{ row }">
          <el-select v-if="canWrite" v-model="row.status" size="mini" :disabled="statusBusy === row.id" @change="changeStatus(row)">
            <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
          </el-select>
          <el-tag v-else size="mini">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="優先級" width="130">
        <template slot-scope="{ row }">
          <el-select v-if="canWrite" v-model="row.priority" size="mini" :disabled="priorityBusy === row.id" @change="changePriority(row)">
            <el-option v-for="p in priorityOptions" :key="p" :label="p" :value="p" />
          </el-select>
          <el-tag v-else size="mini">{{ row.priority }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="stage" label="階段" width="140" />
      <el-table-column prop="material" label="材料" width="110" />
      <el-table-column label="顏色" width="140">
        <template slot-scope="{ row }">
          <span v-if="row.filePartCount > 1" class="hint">{{ row.filePartCount }} 個零件（多色）</span>
          <span v-else>{{ row.color || 'Any' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="後製/備註" min-width="140">
        <template slot-scope="{ row }">
          <span v-if="row.postProcessing && row.postProcessing.length" class="hint">{{ row.postProcessing.join('、') }}</span>
          <span v-if="row.notes" class="hint" :title="row.notes">・備註：{{ row.notes }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="due" label="到期" width="140" />
      <el-table-column label="操作" width="120">
        <template slot-scope="{ row }">
          <el-button v-permissions="['queue:write']" size="mini" @click="openSchedule(row)">排程</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div v-if="!queue.length" class="empty-hint">目前沒有排程任務</div>

    <el-dialog title="排程到打印機" :visible.sync="scheduleDialogVisible" width="420px">
      <el-form v-if="scheduleTarget" label-width="90px" size="small">
        <el-form-item label="檔案"><span>{{ scheduleTarget.file }}</span></el-form-item>
        <el-form-item label="打印機">
          <el-select v-model="scheduleForm.printerId" style="width: 100%">
            <el-option v-for="p in printers" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="開始時間">
          <el-input v-model="scheduleForm.scheduledStart" placeholder="例如 13:00" />
        </el-form-item>
      </el-form>
      <div slot="footer">
        <el-button @click="scheduleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="scheduling" @click="submitSchedule">確認排程</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { matchQueueJobs, scheduleQueueJob, updateQueueStatus, updateQueuePriority } from '@/api/queue'

  const STATUS_OPTIONS = ['queued', 'printing', 'paused', 'complete', 'failed', 'cancelled']
  const PRIORITY_OPTIONS = ['Rush', 'High', 'Normal', 'Low']

  export default {
    name: 'Queue',
    data() {
      return {
        statusOptions: STATUS_OPTIONS,
        priorityOptions: PRIORITY_OPTIONS,
        matching: '',
        lastMatch: null,
        statusBusy: '',
        priorityBusy: '',
        scheduleDialogVisible: false,
        scheduleTarget: null,
        scheduleForm: { printerId: '', scheduledStart: '13:00' },
        scheduling: false,
      }
    },
    computed: {
      ...mapGetters({ queue: 'queue/list', printers: 'printers/list', permissions: 'user/permissions' }),
      canWrite() {
        return this.permissions.includes('*') || this.permissions.includes('queue:write')
      },
    },
    methods: {
      async preview() {
        this.matching = 'dry'
        try {
          this.lastMatch = await matchQueueJobs(true)
        } finally {
          this.matching = ''
        }
      },
      async commitMatch() {
        this.matching = 'commit'
        try {
          const result = await matchQueueJobs(false)
          this.lastMatch = result
          if (Array.isArray(result.jobs)) result.jobs.forEach((job) => this.$store.commit('queue/patchOne', job))
          if (Array.isArray(result.printers)) this.$store.commit('printers/setAll', result.printers)
          this.$baseMessage(`已配對 ${result.matches.length} 筆任務`, 'success')
        } finally {
          this.matching = ''
        }
      },
      async changeStatus(row) {
        this.statusBusy = row.id
        try {
          const result = await updateQueueStatus(row.id, row.status)
          this.$store.commit('queue/patchOne', result.job)
          if (result.todos) this.$store.commit('queue/setTodos', result.todos)
        } finally {
          this.statusBusy = ''
        }
      },
      async changePriority(row) {
        this.priorityBusy = row.id
        try {
          const result = await updateQueuePriority(row.id, row.priority)
          this.$store.commit('queue/patchOne', result.job)
        } finally {
          this.priorityBusy = ''
        }
      },
      openSchedule(row) {
        this.scheduleTarget = row
        this.scheduleForm = { printerId: row.printerId || (this.printers[0] && this.printers[0].id) || '', scheduledStart: row.scheduledStart || '13:00' }
        this.scheduleDialogVisible = true
      },
      async submitSchedule() {
        if (!this.scheduleForm.printerId) {
          this.$baseMessage('請選擇打印機', 'warning')
          return
        }
        this.scheduling = true
        try {
          const result = await scheduleQueueJob(this.scheduleTarget.id, this.scheduleForm.printerId, this.scheduleForm.scheduledStart)
          this.$store.commit('queue/patchOne', result.job)
          this.$baseMessage('已排程', 'success')
          this.scheduleDialogVisible = false
        } finally {
          this.scheduling = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .queue-container {
    padding: 20px;
  }

  .quickbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;

    .quickbar-note {
      font-size: 12px;
      color: $base-color-gray;
    }
  }

  .empty-hint {
    color: $base-color-gray;
    padding: 20px 0;
    text-align: center;
  }

  .hint {
    color: $base-color-gray;
    font-size: 12px;
  }
</style>
