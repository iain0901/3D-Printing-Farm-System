<template>
  <div class="ai-knowledge-page">
    <vab-page-header
      title="AI 知識庫"
      content="由團隊維護 Chatwoot AI 可引用的材料、服務、付款與交期說明；對話逐字稿仍只保留在 Chatwoot。"
    />
    <el-card shadow="never">
      <div class="toolbar">
        <el-button type="primary" icon="Plus" @click="openCreate">新增知識條目</el-button>
        <el-button icon="Refresh" @click="load">更新</el-button>
      </div>
      <el-table v-loading="loading" :data="items" row-key="id">
        <el-table-column prop="title" label="標題" min-width="180" />
        <el-table-column prop="category" label="分類" width="120" />
        <el-table-column label="標籤" min-width="160">
          <template #default="{ row }">
            <el-tag v-for="tag in row.tags" :key="tag" size="small" class="tag">{{ tag }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="狀態" width="105">
          <template #default="{ row }">
            <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '啟用' : '停用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新者" prop="updatedBy" width="160" />
        <el-table-column label="操作" width="180">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">編輯</el-button>
            <el-button size="small" type="danger" plain @click="remove(row)">刪除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && !items.length" description="尚未建立 AI 知識條目" />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '編輯 AI 知識條目' : '新增 AI 知識條目'" width="640px" @closed="resetForm">
      <el-form label-position="top">
        <el-form-item label="標題"><el-input v-model.trim="form.title" maxlength="160" show-word-limit /></el-form-item>
        <el-form-item label="分類"><el-input v-model.trim="form.category" placeholder="例如：materials、delivery、payment" /></el-form-item>
        <el-form-item label="標籤"><el-input v-model="form.tagsText" placeholder="以逗號分隔，例如：PETG, 耐熱, 交期" /></el-form-item>
        <el-form-item label="AI 可引用內容">
          <el-input
            v-model.trim="form.content"
            type="textarea"
            :rows="8"
            maxlength="6000"
            show-word-limit
            placeholder="寫入已確認的服務規則、材料限制或回覆準則。"
          />
        </el-form-item>
        <el-form-item label="啟用"><el-switch v-model="form.enabled" active-text="AI 可引用" inactive-text="停用" /></el-form-item>
      </el-form>
      <template #footer>
        <div>
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" :loading="saving" @click="save">儲存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script>
  import { createAiKnowledge, deleteAiKnowledge, fetchAiKnowledge, updateAiKnowledge } from '@/api/ai-knowledge'
  const blank = () => ({ title: '', category: 'general', tagsText: '', content: '', enabled: true })
  export default {
    name: 'AiKnowledge',
    data() {
      return { loading: false, items: [], dialogVisible: false, editingId: '', saving: false, form: blank() }
    },
    created() {
      this.load()
    },
    methods: {
      async load() {
        this.loading = true
        try {
          this.items = await fetchAiKnowledge()
        } finally {
          this.loading = false
        }
      },
      openCreate() {
        this.editingId = ''
        this.form = blank()
        this.dialogVisible = true
      },
      openEdit(item) {
        this.editingId = item.id
        this.form = {
          title: item.title,
          category: item.category,
          tagsText: (item.tags || []).join(', '),
          content: item.content,
          enabled: item.enabled !== false,
        }
        this.dialogVisible = true
      },
      resetForm() {
        this.form = blank()
        this.editingId = ''
      },
      async save() {
        if (!this.form.title || !this.form.content) return this.$baseMessage('請填寫標題與可引用內容。', 'warning')
        this.saving = true
        try {
          const payload = {
            title: this.form.title,
            category: this.form.category || 'general',
            content: this.form.content,
            tags: this.form.tagsText
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean),
            enabled: this.form.enabled,
          }
          const item = this.editingId ? await updateAiKnowledge(this.editingId, payload) : await createAiKnowledge(payload)
          const index = this.items.findIndex((entry) => entry.id === item.id)
          if (index === -1) this.items.unshift(item)
          else this.items.splice(index, 1, item)
          this.dialogVisible = false
          this.$baseMessage('AI 知識條目已儲存。', 'success')
        } finally {
          this.saving = false
        }
      },
      async remove(item) {
        try {
          await this.$confirm(`刪除「${item.title}」後，Chatwoot AI 不會再引用此內容。`, '確認刪除', { type: 'warning' })
          await deleteAiKnowledge(item.id)
          this.items = this.items.filter((entry) => entry.id !== item.id)
          this.$baseMessage('已刪除知識條目。', 'success')
        } catch (_) {}
      },
    },
  }
</script>

<style lang="scss" scoped>
  .ai-knowledge-page {
    padding: 20px;
  }
  .toolbar {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
  }
  .tag {
    margin: 2px 4px 2px 0;
  }
</style>
