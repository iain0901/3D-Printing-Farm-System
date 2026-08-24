<template>
  <div class="customers-container">
    <div class="quickbar">
      <el-button v-permissions="['orders:write']" type="primary" icon="CirclePlus" @click="openCreate">新增客戶</el-button>
    </div>
    <el-table :data="customers" style="width: 100%">
      <el-table-column prop="name" label="姓名" min-width="140" />
      <el-table-column prop="company" label="公司" min-width="140" />
      <el-table-column prop="email" label="Email" min-width="180" />
      <el-table-column prop="phone" label="電話" width="140" />
      <el-table-column label="標籤" min-width="140">
        <template #default="{ row }"><el-tag v-for="t in row.tags" :key="t" size="small" style="margin-right: 4px">{{ t }}</el-tag></template>
      </el-table-column>
      <el-table-column label="操作" width="160" v-permissions="['orders:write']">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">編輯</el-button>
          <el-button size="small" type="danger" @click="remove(row)">刪除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <div v-if="!customers.length" class="empty-hint">尚無客戶資料</div>

    <el-dialog :title="form.id ? '編輯客戶' : '新增客戶'" v-model="dialogVisible" width="460px">
      <el-form label-width="80px" size="small">
        <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="公司"><el-input v-model="form.company" /></el-form-item>
        <el-form-item label="Email"><el-input v-model="form.email" /></el-form-item>
        <el-form-item label="電話"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item label="備註"><el-input v-model="form.notes" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><div>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">儲存</el-button>
      </div></template>
    </el-dialog>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { createCustomer, updateCustomer, deleteCustomer } from '@/api/customers'

  export default {
    name: 'Customers',
    data() {
      return {
        dialogVisible: false,
        saving: false,
        form: this.emptyForm(),
      }
    },
    computed: {
      ...mapGetters({ customers: 'customers/list' }),
    },
    methods: {
      emptyForm() {
        return { id: '', name: '', company: '', email: '', phone: '', notes: '' }
      },
      openCreate() {
        this.form = this.emptyForm()
        this.dialogVisible = true
      },
      openEdit(row) {
        this.form = { id: row.id, name: row.name, company: row.company || '', email: row.email || '', phone: row.phone || '', notes: row.notes || '' }
        this.dialogVisible = true
      },
      async submit() {
        if (!this.form.name.trim()) {
          this.$baseMessage('請輸入姓名', 'warning')
          return
        }
        this.saving = true
        try {
          if (this.form.id) {
            const updated = await updateCustomer(this.form.id, { name: this.form.name, company: this.form.company, email: this.form.email, phone: this.form.phone, notes: this.form.notes })
            this.$store.commit('customers/patchOne', updated)
          } else {
            const created = await createCustomer({ name: this.form.name, company: this.form.company, email: this.form.email, phone: this.form.phone, notes: this.form.notes })
            this.$store.commit('customers/patchOne', created)
          }
          this.$baseMessage('已儲存', 'success')
          this.dialogVisible = false
        } finally {
          this.saving = false
        }
      },
      async remove(row) {
        this.$baseConfirm(`確定要刪除「${row.name}」嗎？`, null, async () => {
          await deleteCustomer(row.id)
          this.$store.commit('customers/removeOne', row.id)
          this.$baseMessage('已刪除', 'success')
        })
      },
    },
  }
</script>

<style lang="scss" scoped>
  .customers-container {
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
