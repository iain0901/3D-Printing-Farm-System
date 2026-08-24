<template>
  <div class="team-container">
    <div class="quickbar">
      <el-button v-permissions="['users:write']" type="primary" icon="CirclePlus" @click="dialogVisible = true">邀請成員</el-button>
    </div>
    <el-table :data="users" style="width: 100%">
      <el-table-column prop="name" label="姓名" min-width="140" />
      <el-table-column prop="email" label="Email" min-width="200" />
      <el-table-column label="角色" width="150">
        <template #default="{ row }">
          <el-select v-if="canWrite" v-model="row.role" size="small" @change="changeRole(row)">
            <el-option v-for="r in roles" :key="r" :label="r" :value="r" />
          </el-select>
          <el-tag v-else size="small">{{ row.role }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="location" label="位置" width="140" />
      <el-table-column prop="lastSeen" label="最近上線" width="120" />
      <el-table-column label="操作" width="110" v-permissions="['users:write']">
        <template #default="{ row }">
          <el-button size="small" :loading="resetBusy === row.id" @click="resetPassword(row)">重設密碼</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div v-if="!users.length" class="empty-hint">尚無團隊成員</div>

    <el-dialog title="邀請成員" v-model="dialogVisible" width="420px">
      <el-form label-width="80px" size="small">
        <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="Email"><el-input v-model="form.email" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%">
            <el-option v-for="r in roles" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>
        <el-form-item label="位置"><el-input v-model="form.location" /></el-form-item>
      </el-form>
      <template #footer><div>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">邀請</el-button>
      </div></template>
    </el-dialog>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { fetchState } from '@/api/realtime'
  import { inviteUser, updateUser, resetUserPassword } from '@/api/team'

  const ROLES = ['Owner', 'Admin', 'Operator', 'Student', 'Viewer']

  export default {
    name: 'Team',
    data() {
      return {
        users: [],
        roles: ROLES,
        dialogVisible: false,
        saving: false,
        resetBusy: '',
        form: { name: '', email: '', role: 'Operator', location: '' },
      }
    },
    computed: {
      ...mapGetters({ permissions: 'user/permissions' }),
      canWrite() {
        return this.permissions.includes('*') || this.permissions.includes('users:write')
      },
    },
    created() {
      this.load()
    },
    methods: {
      async load() {
        const data = await fetchState()
        this.users = data.users || []
      },
      async changeRole(row) {
        const updated = await updateUser(row.id, { role: row.role })
        const index = this.users.findIndex((u) => u.id === row.id)
        if (index !== -1) this.users.splice(index, 1, updated)
      },
      async resetPassword(row) {
        this.resetBusy = row.id
        try {
          const result = await resetUserPassword(row.id)
          this.$baseAlert(`已為 ${row.email} 重設密碼。${result.temporaryPassword ? '臨時密碼：' + result.temporaryPassword : ''}`, '密碼已重設')
        } finally {
          this.resetBusy = ''
        }
      },
      async submit() {
        if (!this.form.name.trim() || !this.form.email.trim()) {
          this.$baseMessage('請填寫姓名與 Email', 'warning')
          return
        }
        this.saving = true
        try {
          const result = await inviteUser(this.form)
          this.users.push(result.user)
          this.dialogVisible = false
          this.$baseAlert(`已邀請 ${result.user.email}。${result.temporaryPassword ? '臨時密碼：' + result.temporaryPassword : ''}`, '邀請成功')
        } finally {
          this.saving = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .team-container {
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
