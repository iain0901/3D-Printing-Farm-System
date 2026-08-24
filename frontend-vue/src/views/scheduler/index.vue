<template>
  <div class="scheduler-container">
    <el-row :gutter="16">
      <el-col :xs="24" :md="8">
        <el-card shadow="never">
          <template #header><div>自動排程</div></template>
          <p class="hint">依優先級與到期時間，將所有「待排程」任務自動分配到打印機。</p>
          <el-button v-permissions="['queue:write']" type="primary" :loading="busy === 'auto'" @click="runAuto">執行自動排程</el-button>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="8">
        <el-card shadow="never">
          <template #header><div>最佳化排程</div></template>
          <p class="hint">依策略重新分配，降低換料成本或平衡負載。</p>
          <el-select v-model="strategy" size="small" style="width: 100%; margin-bottom: 10px">
            <el-option label="降低換料成本" value="material-color" />
            <el-option label="到期優先" value="due-priority" />
            <el-option label="負載平衡" value="load-balance" />
          </el-select>
          <el-button v-permissions="['queue:write']" type="primary" :loading="busy === 'optimize'" @click="runOptimize">
            執行最佳化
          </el-button>
        </el-card>
      </el-col>
      <el-col :xs="24" :md="8">
        <el-card shadow="never">
          <template #header><div>求解器排程（LP）</div></template>
          <p class="hint">呼叫線性規劃求解器，依目標函式求最優解。</p>
          <el-select v-model="objective" size="small" style="width: 100%; margin-bottom: 10px">
            <el-option label="最小化換料" value="changeover-min" />
            <el-option label="降低到期風險" value="due-risk" />
            <el-option label="成本平衡" value="balanced-cost" />
          </el-select>
          <el-button v-permissions="['queue:write']" type="primary" :loading="busy === 'constraint'" @click="runConstraint">
            執行求解
          </el-button>
        </el-card>
      </el-col>
    </el-row>

    <el-card v-if="lastResult" shadow="never" class="result-card">
      <template #header><div>上次結果</div></template>
      <p>已排程 {{ lastResult.scheduled.length }} 筆，略過 {{ lastResult.skipped.length }} 筆。</p>
      <p v-if="lastResult.solver">
        求解器：{{ lastResult.solver.engine }}，目標：{{ lastResult.solver.objective }}，
        {{ lastResult.solver.feasible ? '有可行解' : '無可行解' }}
      </p>
      <el-table :data="lastResult.scheduled" size="small" max-height="320">
        <el-table-column prop="file" label="檔案" />
        <el-table-column prop="printer" label="打印機" />
        <el-table-column prop="material" label="材料" width="90" />
        <el-table-column label="顏色" width="130">
          <template #default="{ row }">
            <span v-if="row.filePartCount > 1" class="hint">{{ row.filePartCount }} 個零件（多色）</span>
            <span v-else>{{ row.color || 'Any' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="scheduledStart" label="開始時間" width="100" />
        <el-table-column label="警告">
          <template #default="{ row }">{{ (row.warnings || []).join('、') || '—' }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script>
  import { autoSchedule, optimizeSchedule, solveConstraintSchedule } from '@/api/scheduler'

  export default {
    name: 'Scheduler',
    data() {
      return {
        busy: '',
        strategy: 'material-color',
        objective: 'changeover-min',
        lastResult: null,
      }
    },
    methods: {
      applyResult(result) {
        this.lastResult = result
        if (Array.isArray(result.jobs)) result.jobs.forEach((job) => this.$store.commit('queue/patchOne', job))
        if (Array.isArray(result.spools)) {
          // spools 目前尚無独立 Vuex 模块（見計畫 Phase 4），暫不落地，仅在结果卡片展示排程本身
        }
      },
      async runAuto() {
        this.busy = 'auto'
        try {
          this.applyResult(await autoSchedule())
          this.$baseMessage('自動排程完成', 'success')
        } finally {
          this.busy = ''
        }
      },
      async runOptimize() {
        this.busy = 'optimize'
        try {
          this.applyResult(await optimizeSchedule(this.strategy))
          this.$baseMessage('最佳化排程完成', 'success')
        } finally {
          this.busy = ''
        }
      },
      async runConstraint() {
        this.busy = 'constraint'
        try {
          this.applyResult(await solveConstraintSchedule(this.objective))
          this.$baseMessage('求解器排程完成', 'success')
        } finally {
          this.busy = ''
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .scheduler-container {
    padding: 20px;
  }

  .hint {
    color: $base-color-gray;
    font-size: 13px;
    min-height: 36px;
  }

  .result-card {
    margin-top: 16px;
  }
</style>
