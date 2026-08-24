<template>
  <div class="analytics-container">
    <el-row :gutter="16" class="metric-row">
      <el-col v-for="metric in metrics" :key="metric.label" :xs="12" :sm="8" :md="4">
        <el-card shadow="never" class="metric-card">
          <div class="metric-label">{{ metric.label }}</div>
          <div class="metric-value">{{ metric.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="chart-card">
      <template #header><div>近期產量趨勢</div></template>
      <vab-chart v-if="chartOption" :option="chartOption" style="height: 320px" autoresize />
      <div v-else class="empty-hint">尚無資料</div>
    </el-card>

    <el-card shadow="never">
      <template #header><div>打印機負載</div></template>
      <el-table :data="analytics.printerLoad || []" style="width: 100%">
        <el-table-column prop="printer" label="打印機" min-width="140" />
        <el-table-column prop="status" label="狀態" width="110" />
        <el-table-column prop="utilization" label="使用率 %" width="110" />
        <el-table-column prop="queued" label="待處理" width="90" />
        <el-table-column prop="active" label="進行中" width="90" />
      </el-table>
    </el-card>
  </div>
</template>

<script>
  import VabChart from '@/plugins/echarts'
  import { fetchAnalytics } from '@/api/analytics'

  export default {
    name: 'Analytics',
    components: { VabChart },
    data() {
      return {
        analytics: {},
      }
    },
    computed: {
      metrics() {
        const a = this.analytics
        return [
          { label: '總任務數', value: a.jobs ?? 0 },
          { label: '進行中', value: a.active ?? 0 },
          { label: '排隊中', value: a.queued ?? 0 },
          { label: '已完成', value: a.completed ?? 0 },
          { label: '成功率 %', value: a.successRate ?? 0 },
          { label: '打印機使用率 %', value: a.utilization ?? 0 },
          { label: '總成本', value: `$${a.cost ?? 0}` },
          { label: '總打印時數', value: a.printHours ?? 0 },
        ]
      },
      chartOption() {
        const daily = this.analytics.daily || []
        if (!daily.length) return null
        return {
          tooltip: { trigger: 'axis' },
          legend: { data: ['任務數', '打印時數'] },
          xAxis: { type: 'category', data: daily.map((d) => d.day) },
          yAxis: { type: 'value' },
          series: [
            { name: '任務數', type: 'line', data: daily.map((d) => d.jobs) },
            { name: '打印時數', type: 'line', data: daily.map((d) => d.hours) },
          ],
        }
      },
    },
    created() {
      this.load()
    },
    methods: {
      async load() {
        this.analytics = await fetchAnalytics()
      },
    },
  }
</script>

<style lang="scss" scoped>
  .analytics-container {
    padding: 20px;
  }

  .metric-row {
    margin-bottom: 16px;
  }

  .metric-card {
    margin-bottom: 12px;

    :deep(.el-card__body) {
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

  .chart-card {
    margin-bottom: 16px;
  }

  .empty-hint {
    color: $base-color-gray;
    padding: 20px 0;
    text-align: center;
  }
</style>
