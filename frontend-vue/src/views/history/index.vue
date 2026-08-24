<template>
  <div class="history-container">
    <el-table :data="history" style="width: 100%">
      <el-table-column prop="file" label="檔案" min-width="160" />
      <el-table-column prop="printer" label="打印機" width="140" />
      <el-table-column label="狀態" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="row.status === 'complete' ? 'success' : row.status === 'failed' ? 'danger' : 'info'">
            {{ row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="duration" label="時長" width="100" />
      <el-table-column prop="material" label="材料" width="100" />
      <el-table-column label="成本" width="90">
        <template #default="{ row }">${{ row.cost }}</template>
      </el-table-column>
      <el-table-column prop="date" label="日期" width="140" />
      <el-table-column prop="note" label="備註" min-width="140" />
      <el-table-column v-permissions="['queue:write']" label="操作" width="110">
        <template #default="{ row }">
          <el-button size="small" :loading="reprintBusy === row.id" @click="reprint(row)">重印</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div v-if="!history.length" class="empty-hint">尚無歷史紀錄</div>
  </div>
</template>

<script>
  import { fetchHistory, reprintJob } from '@/api/history'

  export default {
    name: 'History',
    data() {
      return { history: [], reprintBusy: '' }
    },
    created() {
      this.load()
    },
    methods: {
      async load() {
        this.history = await fetchHistory()
      },
      async reprint(row) {
        this.reprintBusy = row.id
        try {
          const result = await reprintJob(row.id)
          if (result.job) this.$store.commit('queue/patchOne', result.job)
          this.$baseMessage(`已建立重印任務：${row.file}`, 'success')
        } finally {
          this.reprintBusy = ''
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .history-container {
    padding: 20px;
  }

  .empty-hint {
    color: $base-color-gray;
    padding: 20px 0;
    text-align: center;
  }
</style>
