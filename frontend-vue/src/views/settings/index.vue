<template>
  <div class="settings-container">
    <el-card shadow="never" class="settings-card">
      <div slot="header">工作區設定</div>
      <el-form label-width="140px" size="small">
        <el-form-item label="組織名稱"><el-input v-model="form.organizationName" :disabled="!canWrite" /></el-form-item>
        <el-form-item label="預設地點"><el-input v-model="form.defaultLocation" :disabled="!canWrite" /></el-form-item>
        <el-form-item label="Hot-drop 模式">
          <el-select v-model="form.hotDropMode" :disabled="!canWrite" style="width: 100%">
            <el-option label="僅上傳" value="Upload Only" />
            <el-option label="直接列印" value="Direct Print" />
            <el-option label="自動排隊" value="Auto-Queue" />
          </el-select>
        </el-form-item>
        <el-form-item label="要求管理員 2FA">
          <el-switch v-model="form.requireAdmin2fa" :disabled="!canWrite" />
        </el-form-item>
        <el-form-item v-if="canWrite">
          <el-button type="primary" :loading="saving" @click="save">儲存</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="settings-card">
      <div slot="header">兩步驗證（2FA）</div>
      <p v-if="twoFactor.enabled" class="hint">已啟用兩步驗證，剩餘 {{ twoFactor.recoveryCodesRemaining }} 組恢復碼。</p>
      <template v-else>
        <el-button v-if="!qrDataUrl" type="primary" :loading="settingUp" @click="beginSetup">開始設定</el-button>
        <div v-else class="two-factor-setup">
          <img :src="qrDataUrl" alt="2FA QR code" class="qr-image" />
          <el-form label-width="90px" size="small" style="max-width: 320px">
            <el-form-item label="驗證碼"><el-input v-model="enableForm.code" placeholder="6 位數驗證碼" /></el-form-item>
            <el-form-item label="目前密碼"><el-input v-model="enableForm.password" type="password" show-password /></el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="enabling" @click="confirmEnable">啟用</el-button>
            </el-form-item>
          </el-form>
        </div>
      </template>
    </el-card>
  </div>
</template>

<script>
  import { mapGetters } from 'vuex'
  import QRCode from 'qrcode'
  import { fetchWorkspaceSettings, updateWorkspaceSettings, setupTwoFactor, enableTwoFactor } from '@/api/settings'

  export default {
    name: 'Settings',
    data() {
      return {
        form: { organizationName: '', defaultLocation: '', hotDropMode: 'Direct Print', requireAdmin2fa: true },
        saving: false,
        twoFactor: { enabled: false, recoveryCodesRemaining: 0 },
        qrDataUrl: '',
        pendingSecret: '',
        settingUp: false,
        enabling: false,
        enableForm: { code: '', password: '' },
      }
    },
    computed: {
      ...mapGetters({ currentUser: 'user/currentUser', permissions: 'user/permissions' }),
      canWrite() {
        return this.permissions.includes('*') || this.permissions.includes('settings:write')
      },
    },
    created() {
      this.load()
      if (this.currentUser?.twoFactor) this.twoFactor = this.currentUser.twoFactor
    },
    methods: {
      async load() {
        const settings = await fetchWorkspaceSettings()
        this.form = { organizationName: settings.organizationName, defaultLocation: settings.defaultLocation, hotDropMode: settings.hotDropMode, requireAdmin2fa: settings.requireAdmin2fa }
      },
      async save() {
        this.saving = true
        try {
          await updateWorkspaceSettings(this.form)
          this.$baseMessage('設定已儲存', 'success')
        } finally {
          this.saving = false
        }
      },
      async beginSetup() {
        this.settingUp = true
        try {
          const result = await setupTwoFactor()
          this.pendingSecret = result.secret
          this.qrDataUrl = await QRCode.toDataURL(result.otpauthUrl)
        } finally {
          this.settingUp = false
        }
      },
      async confirmEnable() {
        if (!this.enableForm.code || !this.enableForm.password) {
          this.$baseMessage('請輸入驗證碼與目前密碼', 'warning')
          return
        }
        this.enabling = true
        try {
          const result = await enableTwoFactor({ secret: this.pendingSecret, code: this.enableForm.code, password: this.enableForm.password })
          this.twoFactor = result.user.twoFactor
          this.$store.commit('user/setCurrentUser', result.user)
          this.qrDataUrl = ''
          this.$baseMessage('兩步驗證已啟用', 'success')
        } finally {
          this.enabling = false
        }
      },
    },
  }
</script>

<style lang="scss" scoped>
  .settings-container {
    padding: 20px;
  }

  .settings-card {
    max-width: 560px;
    margin-bottom: 16px;
  }

  .hint {
    color: $base-color-gray;
    font-size: 13px;
  }

  .two-factor-setup {
    display: flex;
    gap: 20px;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .qr-image {
    width: 180px;
    height: 180px;
  }
</style>
