<template>
  <div class="printers-container">
    <div class="quickbar">
      <el-button v-permissions="['printers:control']" type="primary" icon="CirclePlus" @click="addDialogVisible = true">新增打印機</el-button>
      <el-radio-group v-model="mode" size="small">
        <el-radio-button label="cards">卡片</el-radio-button>
        <el-radio-button label="table">表格</el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="mode === 'cards'" class="printer-grid">
      <div v-for="printer in printers" :key="printer.id" class="printer-card" @click="openDrawer(printer)">
        <div class="printer-card-head">
          <h3>{{ printer.name }}</h3>
          <el-tag size="small" :type="statusTagType(printer.status)">{{ printer.status }}</el-tag>
        </div>
        <p class="printer-card-meta">{{ printer.model }} · {{ printer.location }}</p>
        <div class="temperature">{{ printer.nozzle }}/{{ printer.targetNozzle }}°C · {{ printer.bed }}/{{ printer.targetBed }}°C bed</div>
        <el-progress :percentage="printer.progress || 0" :stroke-width="6" :show-text="false" />
        <small>{{ printer.job || '閒置' }} · {{ printer.filament }}</small>
      </div>
      <div v-if="!printers.length" class="empty-hint">尚無打印機，點右上角「新增打印機」開始</div>
    </div>

    <el-table v-else :data="printers" style="width: 100%">
      <el-table-column prop="name" label="名稱" />
      <el-table-column prop="model" label="型號" />
      <el-table-column label="狀態" width="120">
        <template #default="{ row }"><el-tag size="small" :type="statusTagType(row.status)">{{ row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column label="溫度" width="160">
        <template #default="{ row }">{{ row.nozzle }}/{{ row.targetNozzle }}°C · {{ row.bed }}/{{ row.targetBed }}°C</template>
      </el-table-column>
      <el-table-column label="工作" prop="job">
        <template #default="{ row }">{{ row.job || '閒置' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180">
        <template #default="{ row }">
          <el-button size="small" @click="openDrawer(row)">開啟</el-button>
          <el-button size="small" v-permissions="['actions:write']" :loading="actionBusy === row.id" @click="quickToggle(row)">{{ row.status === 'printing' ? '暫停' : '啟動' }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-drawer v-model="drawerVisible" :title="activePrinter && activePrinter.name" size="380px" direction="rtl">
      <div v-if="activePrinter" class="printer-drawer">
        <p class="drawer-meta">{{ activePrinter.model }} · {{ activePrinter.connection }}</p>
        <el-tag size="small" :type="statusTagType(activePrinter.status)">{{ activePrinter.status }}</el-tag>

        <el-row :gutter="12" class="drawer-metrics">
          <el-col :span="12"><div class="drawer-metric"><span>進度</span><strong>{{ Math.round(activePrinter.progress || 0) }}%</strong></div></el-col>
          <el-col :span="12"><div class="drawer-metric"><span>佇列</span><strong>{{ activePrinter.queue || 0 }}</strong></div></el-col>
          <el-col :span="12"><div class="drawer-metric"><span>噴頭</span><strong>{{ activePrinter.nozzle }}/{{ activePrinter.targetNozzle }}°C</strong></div></el-col>
          <el-col :span="12"><div class="drawer-metric"><span>熱床</span><strong>{{ activePrinter.bed }}/{{ activePrinter.targetBed }}°C</strong></div></el-col>
        </el-row>
        <el-progress :percentage="activePrinter.progress || 0" :stroke-width="8" />

        <h3 class="drawer-section-title">控制</h3>
        <div class="control-grid" v-permissions="['actions:write']">
          <el-button @click="control('pause')" v-if="activePrinter.status !== 'paused'">暫停</el-button>
          <el-button @click="control('resume')" v-else>恢復</el-button>
          <el-button @click="control('start')">啟動</el-button>
          <el-button @click="control('cancel')">取消</el-button>
          <el-button @click="control('home axes')">回原點</el-button>
          <el-button @click="control('preheat')">預熱</el-button>
          <el-button @click="control('cooldown')">降溫</el-button>
        </div>
      </div>
    </el-drawer>

    <el-dialog title="新增打印機" v-model="addDialogVisible" width="480px">
      <el-form :model="addForm" label-width="110px" size="small">
        <el-form-item label="連線方式">
          <el-select v-model="addForm.connection" style="width: 100%">
            <el-option v-for="m in connectionMethods" :key="m" :label="m" :value="m" />
          </el-select>
        </el-form-item>
        <el-form-item label="名稱"><el-input v-model="addForm.name" /></el-form-item>
        <el-form-item label="型號"><el-input v-model="addForm.model" /></el-form-item>
        <el-form-item label="位置"><el-input v-model="addForm.location" /></el-form-item>
        <el-form-item label="已裝線材"><el-input v-model="addForm.filament" /></el-form-item>
        <el-form-item label="相容材料"><el-input v-model="addForm.materialsText" placeholder="以逗號分隔，例如 PLA,PETG,TPU" /></el-form-item>
        <el-form-item label="成型範圍 mm">
          <el-row :gutter="8">
            <el-col :span="8"><el-input-number v-model="addForm.volume[0]" :min="1" controls-position="right" style="width: 100%" /></el-col>
            <el-col :span="8"><el-input-number v-model="addForm.volume[1]" :min="1" controls-position="right" style="width: 100%" /></el-col>
            <el-col :span="8"><el-input-number v-model="addForm.volume[2]" :min="1" controls-position="right" style="width: 100%" /></el-col>
          </el-row>
        </el-form-item>
      </el-form>
      <template #footer><div>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitAdd">新增</el-button>
      </div></template>
    </el-dialog>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { createPrinter, sendPrinterAction } from '@/api/printers'

  const CONNECTION_METHODS = ['OctoPrint', 'Klipper / Moonraker', 'Cloud bridge', 'Manual setup']

  export default {
    name: 'Printers',
    data() {
      return {
        mode: 'cards',
        drawerVisible: false,
        activePrinter: null,
        addDialogVisible: false,
        creating: false,
        actionBusy: '',
        connectionMethods: CONNECTION_METHODS,
        addForm: this.defaultAddForm(),
      }
    },
    computed: {
      ...mapGetters({ printers: 'printers/list' }),
    },
    methods: {
      defaultAddForm() {
        return {
          connection: 'Klipper / Moonraker',
          name: 'New Lab Printer',
          model: 'CoreXY 300',
          location: 'Studio North',
          filament: 'PLA Matte Black',
          materialsText: 'PLA,PETG,TPU',
          volume: [300, 300, 300],
        }
      },
      statusTagType(status) {
        if (status === 'printing') return 'success'
        if (status === 'error') return 'danger'
        if (status === 'paused' || status === 'maintenance') return 'warning'
        return 'info'
      },
      openDrawer(printer) {
        this.activePrinter = printer
        this.drawerVisible = true
      },
      async quickToggle(printer) {
        this.actionBusy = printer.id
        try {
          await sendPrinterAction(printer.id, printer.status === 'printing' ? 'pause' : 'start')
        } finally {
          this.actionBusy = ''
        }
      },
      async control(action) {
        if (!this.activePrinter) return
        const id = this.activePrinter.id
        const result = await sendPrinterAction(id, action)
        this.$store.commit('printers/patchOne', result.printer)
        if (result.job) this.$store.commit('queue/patchOne', result.job)
        if (result.todos) this.$store.commit('queue/setTodos', result.todos)
        this.activePrinter = this.printers.find((p) => p.id === id) || this.activePrinter
        this.$baseMessage(`${result.action} 指令已送出`, 'success')
      },
      async submitAdd() {
        if (!this.addForm.name.trim()) {
          this.$baseMessage('請輸入印表機名稱', 'warning')
          return
        }
        this.creating = true
        try {
          const materials = this.addForm.materialsText.split(',').map((item) => item.trim()).filter(Boolean)
          const isManual = this.addForm.connection === 'Manual setup'
          await createPrinter({
            name: this.addForm.name,
            model: this.addForm.model,
            location: this.addForm.location,
            status: 'idle',
            connection: this.addForm.connection,
            nozzle: 24,
            bed: 24,
            targetNozzle: 0,
            targetBed: 0,
            filament: this.addForm.filament,
            compatibleMaterials: materials,
            buildVolume: this.addForm.volume,
            camera: isManual ? 'No camera' : 'Setup pending',
          })
          this.$baseMessage('印表機已新增', 'success')
          this.addDialogVisible = false
          this.addForm = this.defaultAddForm()
        } finally {
          this.creating = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .printers-container {
    padding: 20px;
  }

  .quickbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .printer-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 14px;
  }

  .printer-card {
    border: 1px solid $base-border-color;
    border-radius: $base-border-radius;
    padding: 14px;
    cursor: pointer;
    background: $base-color-white;
    transition: box-shadow 0.2s;

    &:hover {
      box-shadow: $base-box-shadow;
    }

    .printer-card-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 4px;

      h3 {
        margin: 0;
        font-size: 15px;
      }
    }

    .printer-card-meta {
      font-size: 12px;
      color: $base-color-gray;
      margin: 0 0 8px;
    }

    .temperature {
      font-size: 12px;
      color: $base-color-gray;
      margin-bottom: 8px;
    }

    small {
      display: block;
      margin-top: 8px;
      color: $base-color-gray;
    }
  }

  .empty-hint {
    color: $base-color-gray;
    padding: 20px 0;
  }

  .printer-drawer {
    padding: 0 20px 20px;

    .drawer-meta {
      color: $base-color-gray;
      margin: 0 0 8px;
    }

    .drawer-metrics {
      margin: 16px 0 8px;
    }

    .drawer-metric {
      span {
        display: block;
        font-size: 12px;
        color: $base-color-gray;
      }

      strong {
        font-size: 18px;
      }
    }

    .drawer-section-title {
      margin: 20px 0 10px;
      font-size: 14px;
    }

    .control-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
  }
</style>
