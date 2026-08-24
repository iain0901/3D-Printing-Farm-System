<template>
  <el-dropdown @command="handleCommand" trigger="click">
    <div class="avatar-container">
      <div class="avatar-wrapper">
        <div class="user-avatar">{{ initials }}</div>
      </div>
    </div>

    <template #dropdown><el-dropdown-menu class="custom-dropdown">
      <div class="dropdown-header">
        <div class="header-avatar">{{ initials }}</div>
        <div class="header-info">
          <div class="header-username">{{ username }}</div>
          <div class="header-email">{{ email }}</div>
          <div class="header-role">{{ role }}</div>
        </div>
      </div>

      <el-dropdown-item command="logout" class="dropdown-item logout-item">
        <el-icon><SwitchButton /></el-icon>
        <span>退出登录</span>
      </el-dropdown-item>
    </el-dropdown-menu></template>
  </el-dropdown>
</template>

<script>
  import { mapGetters } from 'vuex'
  import { recordRoute } from '@/config'

  export default {
    name: 'VabAvatar',
    computed: {
      ...mapGetters({
        username: 'user/username',
        email: 'user/email',
        role: 'user/role',
      }),
      initials() {
        return (this.username || '?').trim().slice(0, 1).toUpperCase()
      },
    },
    methods: {
      handleCommand(command) {
        if (command === 'logout') this.logout()
      },
      logout() {
        this.$baseConfirm('您确定要退出' + this.$baseTitle + '吗?', null, async () => {
          await this.$store.dispatch('user/logout')
          if (recordRoute) {
            const fullPath = this.$route.fullPath
            this.$router.push(`/login?redirect=${fullPath}`)
          } else {
            this.$router.push('/login')
          }
        })
      },
    },
  }
</script>

<style lang="scss" scoped>
  .avatar-container {
    display: flex;
    align-items: center;
    border-radius: 8px;
    cursor: pointer;

    .avatar-wrapper {
      position: relative;

      .user-avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 37.5px;
        height: 37.5px;
        border-radius: 50%;
        background: linear-gradient(135deg, #4d8af0 0%, #1a56db 100%);
        color: #fff;
        font-weight: 600;
        border: 2px solid rgba(255, 255, 255, 0.3);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }
    }
  }

  .custom-dropdown {
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(255, 255, 255, 0.95);
    padding: 0;
    min-width: 220px;

    .dropdown-header {
      display: flex;
      align-items: center;
      padding: 16px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      background: linear-gradient(135deg, #4d8af0 0%, #1a56db 100%);
      border-radius: 12px 12px 0 0;
      color: white;

      .header-avatar {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);
        border: 2px solid rgba(255, 255, 255, 0.3);
        margin-right: 12px;
        font-weight: 600;
      }

      .header-info {
        flex: 1;

        .header-username {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .header-email,
        .header-role {
          font-size: 12px;
          opacity: 0.8;
        }
      }
    }

    .dropdown-item {
      display: flex;
      align-items: center;
      padding: 8px 16px;
      border-radius: 0;

      i {
        margin-right: 12px;
        font-size: 16px;
        width: 16px;
        text-align: center;
      }

      span {
        font-size: 14px;
      }

      &.logout-item {
        color: #f56c6c;
      }
    }
  }
</style>
