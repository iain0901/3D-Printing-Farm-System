<template>
  <el-scrollbar :class="{ 'is-collapse': collapse }" class="side-container">
    <vab-logo />
    <el-menu
      active-text-color=" hsla(0, 0%, 100%, 0.95)"
      background-color="#191a23"
      :collapse="collapse"
      :collapse-transition="false"
      :default-active="activeMenu"
      :default-openeds="defaultOpens"
      text-color=" hsla(0, 0%, 100%, 0.95)"
      :unique-opened="uniqueOpened"
      mode="vertical"
    >
      <el-sub-menu v-for="group in groupedRoutes" :key="group.label" :index="group.label">
        <template #title><vab-icon :icon="group.icon" class="admin-group-icon" /><span>{{ group.label }}</span></template>
        <vab-side-item v-for="route in group.items" :key="route.path" :full-path="route.path" :item="route" />
      </el-sub-menu>
    </el-menu>
  </el-scrollbar>
</template>
<script>
  import variables from '@/styles/variables.scss'
  import { mapGetters } from 'vuex'
  import { adminNavGroup, adminGroups } from '@/utils/admin-workspace.mjs'

  export default {
    name: 'VabSide',
    data() {
      return {
        uniqueOpened: true,
      }
    },
    computed: {
      groupedRoutes() {
        const visible = this.routes.filter(r => !r.hidden && (!r.children || r.children.length))
        return adminGroups.map(group => ({ ...group, items: visible.filter(r => adminNavGroup(r.path) === group.label) })).filter(g => g.items.length)
      },
      ...mapGetters({
        collapse: 'settings/collapse',
        routes: 'routes/routes',
      }),
      defaultOpens() {
        if (this.collapse) {
        }
        return [adminNavGroup('/' + this.$route.path.split('/')[1]), ...(this.$route.path.startsWith('/operations/') ? ['/operations'] : [])]
      },
      activeMenu() {
        const route = this.$route
        const { meta, path } = route
        if (meta.activeMenu) {
          return meta.activeMenu
        }
        return path
      },
      variables() {
        return variables
      },
    },
  }
</script>
<style lang="scss" scoped>
  .admin-group-icon { width: 20px; margin-right: 12px; text-align: center; }
  .admin-nav-label { padding:20px 20px 6px; font-size:11px; letter-spacing:.1em; color:#a9b8cf; line-height:1.4; list-style:none; }
  @mixin active {
    &:hover {
      color: $base-color-white;
      background-color: $base-menu-background-active !important;
    }

    &.is-active {
      color: $base-color-white;
      background-color: $base-menu-background-active !important;
    }
  }

  .side-container {
    position: fixed;
    top: 0;
    bottom: 0;
    left: 0;
    z-index: $base-z-index;
    width: $base-left-menu-width;
    height: 100vh;
    overflow: hidden;
    background: $base-menu-background;
    box-shadow: 2px 0 6px rgba(0, 21, 41, 0.35);
    transition: width $base-transition-time;

    &.is-collapse {
      width: $base-left-menu-width-min;
      border-right: 0;

      ::v-deep {
        .el-menu {
          transition: width $base-transition-time;
        }

        .el-menu--collapse {
          border-right: 0;

          .el-submenu__icon-arrow {
            right: 10px;
            margin-top: -3px;
          }

          .el-menu-item,
          .el-submenu {
            text-align: center;
          }
        }
      }
    }

    ::v-deep {
      .el-scrollbar__wrap {
        overflow-x: hidden;
      }

      .el-menu {
        border: 0;

        .vab-fas-icon {
          padding-right: 3px;
          font-size: $base-font-size-default;
          display: inline-block;
          width: 14px;
        }

        .vab-remix-icon {
          padding-right: 3px;
          font-size: $base-font-size-default + 2;
        }
      }

      .el-menu-item,
      .el-submenu__title {
        height: $base-menu-item-height;
        line-height: $base-menu-item-height;
        vertical-align: middle;
      }

      .el-menu-item {
        @include active;
      }
    }
  }
</style>
