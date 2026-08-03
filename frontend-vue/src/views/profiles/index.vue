<template>
  <div class="profiles-container">
    <div class="quickbar">
      <el-button v-permissions="['catalog:write']" type="primary" icon="el-icon-circle-plus" @click="dialogVisible = true">新增設定檔</el-button>
    </div>
    <el-table :data="profiles" style="width: 100%">
      <el-table-column prop="name" label="名稱" min-width="160" />
      <el-table-column prop="kind" label="類型" width="100" />
      <el-table-column prop="target" label="適用對象" min-width="140" />
      <el-table-column prop="source" label="來源" width="120" />
      <el-table-column label="預設" width="90">
        <template slot-scope="{ row }"><el-tag v-if="isDefault(row)" size="mini" type="success">預設</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="200" v-permissions="['catalog:write']">
        <template slot-scope="{ row }">
          <el-button size="mini" :disabled="isDefault(row)" :loading="defaultBusy === row.id" @click="makeDefault(row)">設為預設</el-button>
          <el-button size="mini" type="danger" @click="archive(row)">封存</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div v-if="!profiles.length" class="empty-hint">尚無設定檔</div>

    <el-dialog title="新增設定檔" :visible.sync="dialogVisible" width="420px">
      <el-form label-width="90px" size="small">
        <el-form-item label="名稱"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="類型">
          <el-select v-model="form.kind" style="width: 100%">
            <el-option label="Machine" value="Machine" />
            <el-option label="Process" value="Process" />
            <el-option label="Filament" value="Filament" />
          </el-select>
        </el-form-item>
        <el-form-item label="適用對象"><el-input v-model="form.target" /></el-form-item>
      </el-form>
      <div slot="footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">新增</el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
  import { fetchState } from '@/api/realtime'
  import { createProfile, archiveProfile, setDefaultProfile } from '@/api/profiles'

  export default {
    name: 'Profiles',
    data() {
      return {
        profiles: [],
        profileDefaults: {},
        dialogVisible: false,
        saving: false,
        defaultBusy: '',
        form: { name: '', kind: 'Process', target: 'FDM fleet' },
      }
    },
    created() {
      this.load()
    },
    methods: {
      async load() {
        const data = await fetchState()
        this.profiles = data.profiles || []
        this.profileDefaults = data.profileDefaults || {}
      },
      isDefault(row) {
        return this.profileDefaults[row.kind] === row.id
      },
      async makeDefault(row) {
        this.defaultBusy = row.id
        try {
          const result = await setDefaultProfile(row.id)
          this.profiles = result.profiles
          this.profileDefaults = result.profileDefaults
          this.$baseMessage('已設為預設', 'success')
        } finally {
          this.defaultBusy = ''
        }
      },
      async archive(row) {
        this.$baseConfirm(`確定要封存「${row.name}」嗎？`, null, async () => {
          await archiveProfile(row.id)
          this.profiles = this.profiles.filter((p) => p.id !== row.id)
          this.$baseMessage('已封存', 'success')
        })
      },
      async submit() {
        if (!this.form.name.trim()) {
          this.$baseMessage('請輸入名稱', 'warning')
          return
        }
        this.saving = true
        try {
          const created = await createProfile(this.form)
          this.profiles.push(created)
          this.$baseMessage('設定檔已新增', 'success')
          this.dialogVisible = false
        } finally {
          this.saving = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .profiles-container {
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
