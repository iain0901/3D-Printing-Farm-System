<template>
  <div class="addons-container">
    <el-row :gutter="16">
      <el-col :xs="24" :sm="12" :md="8" v-for="addon in addons" :key="addon.id">
        <el-card shadow="never" class="addon-card">
          <div class="addon-head">
            <b>{{ addon.name }}</b>
            <el-switch v-model="addon.enabled" v-permissions="['settings:write']" :disabled="busy === addon.id" @change="toggle(addon)" />
          </div>
          <el-tag size="small" class="addon-category">{{ addon.category }}</el-tag>
          <p class="addon-desc">{{ addon.description }}</p>
          <el-tag size="small" :type="addon.status === 'enabled' ? 'success' : addon.status === 'beta' ? 'warning' : 'info'">{{ addon.status }}</el-tag>
        </el-card>
      </el-col>
    </el-row>
    <div v-if="!addons.length" class="empty-hint">尚無附加功能</div>
  </div>
</template>

<script>
  import { fetchState } from '@/api/realtime'
  import { updateAddon } from '@/api/addons'

  export default {
    name: 'Addons',
    data() {
      return { addons: [], busy: '' }
    },
    created() {
      this.load()
    },
    methods: {
      async load() {
        const data = await fetchState()
        this.addons = data.addons || []
      },
      async toggle(addon) {
        this.busy = addon.id
        try {
          const updated = await updateAddon(addon.id, { enabled: addon.enabled })
          const index = this.addons.findIndex((a) => a.id === addon.id)
          if (index !== -1) this.addons.splice(index, 1, updated)
        } finally {
          this.busy = ''
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .addons-container {
    padding: 20px;
  }

  .addon-card {
    margin-bottom: 16px;
  }

  .addon-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .addon-category {
    margin-bottom: 8px;
  }

  .addon-desc {
    color: $base-color-gray;
    font-size: 13px;
    min-height: 40px;
  }

  .empty-hint {
    color: $base-color-gray;
    padding: 20px 0;
    text-align: center;
  }
</style>
