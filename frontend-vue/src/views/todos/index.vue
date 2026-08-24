<template>
  <div class="todos-container">
    <el-row :gutter="16" class="metric-row">
      <el-col :xs="12" :sm="8" :md="4" v-for="metric in metrics" :key="metric.label">
        <el-card shadow="never" class="metric-card">
          <div class="metric-label">{{ metric.label }}</div>
          <div class="metric-value">{{ metric.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-table :data="todos" style="width: 100%">
      <el-table-column label="待辦" min-width="220">
        <template #default="{ row }">
          <b>{{ row.title }}</b>
          <div class="todo-note">{{ row.actionNote || '由生產狀態自動產生' }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="owner" label="負責人" width="110" />
      <el-table-column prop="source" label="來源任務" width="160" />
      <el-table-column prop="kind" label="類型" width="110" />
      <el-table-column label="嚴重度" width="100">
        <template #default="{ row }"><el-tag size="small" :type="severityTagType(row.severity)">{{ row.severity }}</el-tag></template>
      </el-table-column>
      <el-table-column label="狀態" width="100">
        <template #default="{ row }"><el-tag size="small">{{ row.status || 'open' }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="due" label="到期" width="120" />
      <el-table-column label="操作" width="220" v-permissions="['queue:write']">
        <template #default="{ row }">
          <el-button size="small" :disabled="row.status === 'claimed'" :loading="busy === row.id + '-claim'" @click="runAction(row, 'claim')">認領</el-button>
          <el-button size="small" :loading="busy === row.id + '-snooze'" @click="runAction(row, 'snooze')">延後</el-button>
          <el-button size="small" type="primary" :loading="busy === row.id + '-complete'" @click="runAction(row, 'complete')">完成</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div v-if="!todos.length" class="empty-hint">目前沒有待辦事項</div>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { actOnTodo } from '@/api/todos'

  export default {
    name: 'Todos',
    data() {
      return { busy: '' }
    },
    computed: {
      ...mapGetters({ todos: 'queue/todos', username: 'user/username' }),
      metrics() {
        const t = this.todos
        return [
          { label: '待辦總數', value: t.length },
          { label: '已認領', value: t.filter((x) => x.status === 'claimed').length },
          { label: '待切片', value: t.filter((x) => x.kind === 'slicing').length },
          { label: '材料變更', value: t.filter((x) => x.kind === 'material').length },
          { label: '尺寸衝突', value: t.filter((x) => x.kind === 'size').length },
          { label: '異常', value: t.filter((x) => x.kind === 'exception').length },
          { label: '已延後', value: t.filter((x) => x.status === 'snoozed').length },
        ]
      },
    },
    methods: {
      severityTagType(severity) {
        if (severity === 'Urgent' || severity === 'High') return 'danger'
        if (severity === 'Medium') return 'warning'
        return 'info'
      },
      async runAction(todo, action) {
        this.busy = `${todo.id}-${action}`
        const payload = action === 'claim'
          ? { owner: this.username || 'Operator', note: 'Claimed from Auto Todos' }
          : action === 'snooze'
            ? { snoozeUntil: 'Tomorrow 09:00', note: 'Snoozed for next shift' }
            : { note: 'Resolved from Auto Todos' }
        try {
          const result = await actOnTodo(todo.id, action, payload)
          this.$store.commit('queue/setTodos', result.todos)
          this.$baseMessage(`${todo.title} · ${result.action.action}`, action === 'complete' ? 'success' : 'info')
        } finally {
          this.busy = ''
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .todos-container {
    padding: 20px;
  }

  .metric-row {
    margin-bottom: 16px;
  }

  .metric-card {
    margin-bottom: 12px;

    ::v-deep .el-card__body {
      padding: 12px;
    }

    .metric-label {
      font-size: 12px;
      color: $base-color-gray;
      margin-bottom: 6px;
    }

    .metric-value {
      font-size: 20px;
      font-weight: 600;
    }
  }

  .todo-note {
    font-size: 12px;
    color: $base-color-gray;
  }

  .empty-hint {
    color: $base-color-gray;
    padding: 20px 0;
    text-align: center;
  }
</style>
