<template>
  <div class="dashboard-container">
    <div class="quickbar">
      <el-button type="primary" icon="el-icon-circle-plus" disabled>新增打印机</el-button>
      <el-button icon="el-icon-upload2" disabled>上传檔案</el-button>
      <el-button icon="el-icon-date" disabled>排程</el-button>
      <el-button icon="el-icon-s-check" disabled>檢視待辦</el-button>
      <span class="quickbar-note">（動作按鈕將在 Phase 3/4 對應視圖完成後啟用）</span>
    </div>

    <el-row :gutter="16" class="metric-row">
      <el-col :xs="12" :sm="8" :md="4" v-for="metric in metrics" :key="metric.label">
        <el-card shadow="never" class="metric-card" :class="metric.tone">
          <div class="metric-label">{{ metric.label }}</div>
          <div class="metric-value">{{ metric.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="panel-row">
      <el-col :xs="24" :md="14">
        <el-card shadow="never">
          <div slot="header" class="panel-header">
            <span>設備狀態</span>
          </div>
          <div v-if="!printers.length" class="empty-hint">尚無打印機資料</div>
          <el-row :gutter="12" v-else>
            <el-col :xs="24" :sm="12" v-for="printer in printers" :key="printer.id">
              <div class="printer-card">
                <div class="printer-card-head">
                  <b>{{ printer.name }}</b>
                  <el-tag size="mini" :type="statusTagType(printer.status)">{{ printer.status }}</el-tag>
                </div>
                <div class="printer-card-meta">{{ printer.model }} · {{ printer.location }}</div>
                <el-progress :percentage="printer.progress || 0" :stroke-width="6" :show-text="false" />
                <div class="printer-card-foot">{{ printer.job || '閒置' }} · {{ printer.filament }}</div>
              </div>
            </el-col>
          </el-row>
        </el-card>
      </el-col>

      <el-col :xs="24" :md="10">
        <el-card shadow="never">
          <div slot="header" class="panel-header"><span>臨近到期任務</span></div>
          <ul class="event-feed">
            <li v-for="job in dueSoon" :key="job.id">
              <span :class="'status-dot ' + job.status" />
              <span class="event-feed-title">{{ job.file }}</span>
              <em>{{ job.due }} · {{ job.priority }}</em>
            </li>
            <li v-if="!dueSoon.length" class="empty-hint">目前沒有緊急到期任務</li>
          </ul>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="panel-row">
      <el-col :xs="24">
        <el-card shadow="never">
          <div slot="header" class="panel-header"><span>自動產生待辦（前 6 筆）</span></div>
          <ul class="event-feed">
            <li v-for="todo in todosPreview" :key="todo.id">
              <span :class="'status-dot ' + (isUrgent(todo) ? 'failed' : 'queued')" />
              <span class="event-feed-title">{{ todo.title }}</span>
              <em>{{ todo.owner }} · {{ todo.due }}</em>
            </li>
            <li v-if="!todosPreview.length" class="empty-hint">目前沒有待辦事項</li>
          </ul>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { isDueRisk } from '@/utils/queue'

  export default {
    name: 'Dashboard',
    computed: {
      ...mapGetters({
        username: 'user/username',
        printers: 'printers/list',
        queue: 'queue/list',
        todos: 'queue/todos',
      }),
      dueSoon() {
        return this.queue.filter(isDueRisk)
      },
      idlePrinters() {
        return this.printers.filter((printer) => printer.status === 'idle')
      },
      problemPrinters() {
        return this.printers.filter((printer) => ['error', 'offline', 'maintenance'].includes(printer.status))
      },
      todosPreview() {
        return this.todos.slice(0, 6)
      },
      metrics() {
        return [
          { label: '今日任務', value: this.queue.length, tone: '' },
          { label: '到期風險', value: this.dueSoon.length, tone: this.dueSoon.length ? 'tone-red' : 'tone-green' },
          { label: '閒置打印機', value: this.idlePrinters.length, tone: 'tone-green' },
          { label: '打印機異常', value: this.problemPrinters.length, tone: this.problemPrinters.length ? 'tone-red' : 'tone-green' },
          { label: '待辦事項', value: this.todos.length, tone: 'tone-orange' },
        ]
      },
    },
    methods: {
      statusTagType(status) {
        if (status === 'printing') return 'success'
        if (status === 'error') return 'danger'
        if (status === 'paused' || status === 'maintenance') return 'warning'
        return 'info'
      },
      isUrgent(todo) {
        return todo.severity === 'Urgent' || todo.severity === 'High'
      },
    },
  }
</script>

<style lang="scss" scoped>
  .dashboard-container {
    padding: 20px;
  }

  .quickbar {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    flex-wrap: wrap;

    .quickbar-note {
      font-size: 12px;
      color: $base-color-gray;
    }
  }

  .metric-row {
    margin-bottom: 16px;
  }

  .metric-card {
    margin-bottom: 12px;

    ::v-deep .el-card__body {
      padding: 14px;
    }

    .metric-label {
      font-size: 12px;
      color: $base-color-gray;
      margin-bottom: 6px;
    }

    .metric-value {
      font-size: 24px;
      font-weight: 600;
    }

    &.tone-red .metric-value {
      color: $base-color-red;
    }

    &.tone-green .metric-value {
      color: $base-color-green;
    }

    &.tone-orange .metric-value {
      color: $base-color-orange;
    }
  }

  .panel-row {
    margin-bottom: 16px;
  }

  .panel-header {
    font-weight: 600;
  }

  .printer-card {
    border: 1px solid $base-border-color;
    border-radius: $base-border-radius;
    padding: 12px;
    margin-bottom: 12px;

    .printer-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .printer-card-meta {
      font-size: 12px;
      color: $base-color-gray;
      margin-bottom: 8px;
    }

    .printer-card-foot {
      font-size: 12px;
      color: $base-color-gray;
      margin-top: 6px;
    }
  }

  .event-feed {
    list-style: none;
    margin: 0;
    padding: 0;

    li {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 0;
      border-bottom: 1px dashed $base-border-color;

      &:last-child {
        border-bottom: none;
      }

      em {
        margin-left: auto;
        font-style: normal;
        font-size: 12px;
        color: $base-color-gray;
      }
    }
  }

  .event-feed-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: $base-color-gray;
    flex: none;

    &.printing,
    &.complete {
      background: $base-color-green;
    }

    &.failed,
    &.error {
      background: $base-color-red;
    }

    &.queued,
    &.paused {
      background: $base-color-orange;
    }
  }

  .empty-hint {
    color: $base-color-gray;
    font-size: 13px;
    padding: 8px 0;
  }
</style>
