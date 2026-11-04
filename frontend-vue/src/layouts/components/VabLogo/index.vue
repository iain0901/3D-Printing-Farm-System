<template>
  <div :class="'logo-container-' + layout">
    <router-link to="/dashboard" aria-label="3DRFM，回到管理總覽" class="staff-brand">
      <b v-if="collapse && layout !== 'horizontal'">3D</b>
      <brand-mark v-else compact subtitle="營運管理工作台" />
    </router-link>
  </div>
</template>
<script>
  import { mapGetters } from 'vuex'
  import BrandMark from '@/components/public/BrandMark.vue'

  export default {
    name: 'VabLogo',
    components: { BrandMark },
    data() {
      return {
        title: this.$baseTitle,
      }
    },
    computed: {
      ...mapGetters({
        logo: 'settings/logo',
        collapse: 'settings/collapse',
        layout: 'settings/layout',
      }),
    },
  }
</script>
<style lang="scss" scoped>
  .staff-brand { display:flex; height:100%; align-items:center; justify-content:center; color:#fff; text-decoration:none; line-height:1.2; }
  @mixin container {
    position: relative;
    height: $base-top-bar-height;
    overflow: hidden;
    line-height: $base-top-bar-height;
    background: $base-menu-background;
  }

  @mixin logo {
    display: inline-block;
    width: 34px;
    height: 34px;
    margin-right: 3px;
    color: $base-title-color;
    fill: $base-title-color;
    vertical-align: middle;
  }

  @mixin title {
    display: inline-block;
    overflow: hidden;
    font-size: 24px;
    line-height: 55px;
    color: $base-title-color;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
  }

  .logo-container-horizontal {
    @include container;

    .logo {
      @include logo;
    }

    .title {
      @include title;
    }
  }

  .logo-container-vertical {
    @include container;

    height: $base-logo-height;
    line-height: $base-logo-height;
    text-align: center;

    .logo {
      @include logo;
      fill: #fff !important;
    }

    .title {
      @include title;

      max-width: calc(#{$base-left-menu-width} - 60px);
      line-height: $base-logo-height; // 修复：使line-height与容器高度一致
    }
  }
</style>
