<template>
  <div class="maintenance-container">
    <div class="quickbar">
      <el-button v-permissions="['maintenance:write']" type="primary" icon="CirclePlus" @click="dialogVisible = true">
        新增維護任務
      </el-button>
    </div>
    <el-table :data="jobs" style="width: 100%">
      <el-table-column prop="title" label="項目" min-width="160" />
      <el-table-column prop="printer" label="打印機" width="140" />
      <el-table-column label="狀態" width="150">
        <template #default="{ row }">
          <el-select v-if="canWrite" v-model="row.status" size="small" @change="changeStatus(row)">
            <el-option v-for="s in statusOptions" :key="s" :label="s" :value="s" />
          </el-select>
          <el-tag v-else size="small">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="severity" label="嚴重度" width="100" />
      <el-table-column prop="progress" label="進度" width="90" />
      <el-table-column prop="due" label="到期" width="120" />
    </el-table>
    <div v-if="!jobs.length" class="empty-hint">尚無維護任務</div>

    <el-dialog v-model="dialogVisible" title="新增維護任務" width="420px">
      <el-form label-width="80px" size="small">
        <el-form-item label="項目"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="打印機">
          <el-select v-model="form.printer" style="width: 100%">
            <el-option v-for="p in printers" :key="p.id" :label="p.name" :value="p.name" />
          </el-select>
        </el-form-item>
        <el-form-item label="嚴重度">
          <el-select v-model="form.severity" style="width: 100%">
            <el-option v-for="s in ['Low', 'Medium', 'High', 'Urgent']" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <div>
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="submit">新增</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { fetchState } from '@/api/realtime'
  import { createMaintenance, updateMaintenance } from '@/api/maintenance'

  const STATUS_OPTIONS = ['scheduled', 'in progress', 'done', 'blocked']

  export default {
    name: 'Maintenance',
    data() {
      return {
        jobs: [],
        statusOptions: STATUS_OPTIONS,
        dialogVisible: false,
        saving: false,
        form: { title: '', printer: '', severity: 'Medium' },
      }
    },
    computed: {
      ...mapGetters({ printers: 'printers/list', permissions: 'user/permissions' }),
      canWrite() {
        return this.permissions.includes('*') || this.permissions.includes('maintenance:write')
      },
    },
    created() {
      this.load()
      if (this.printers.length) this.form.printer = this.printers[0].name
    },
    methods: {
      async load() {
        const data = await fetchState()
        this.jobs = data.maintenance || []
      },
      async changeStatus(row) {
        const updated = await updateMaintenance(row.id, { status: row.status })
        const index = this.jobs.findIndex((j) => j.id === row.id)
        if (index !== -1) this.jobs.splice(index, 1, updated)
      },
      async submit() {
        if (!this.form.title.trim() || !this.form.printer) {
          this.$baseMessage('請填寫項目與打印機', 'warning')
          return
        }
        this.saving = true
        try {
          const job = await createMaintenance(this.form)
          this.jobs.push(job)
          this.$baseMessage('維護任務已新增', 'success')
          this.dialogVisible = false
        } finally {
          this.saving = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .maintenance-container {
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
