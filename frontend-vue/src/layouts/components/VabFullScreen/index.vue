<template>
  <span :title="isFullscreen ? '離開全螢幕' : '進入全螢幕'">
    <vab-icon :icon="['fas', isFullscreen ? 'compress' : 'expand']" @click="click"></vab-icon>
  </span>
</template>

<script>
  import screenfull from 'screenfull'

  export default {
    name: 'VabFullScreen',
    data() {
      return {
        isFullscreen: false,
      }
    },
    mounted() {
      this.init()
    },
    beforeUnmount() {
      this.destroy()
    },
    methods: {
      click() {
        if (!screenfull.isEnabled) {
          this.$baseMessage('開啟全螢幕失敗', 'error')
          return false
        }
        screenfull.toggle()
        this.$emit('refresh')
      },
      change() {
        this.isFullscreen = screenfull.isFullscreen
      },
      init() {
        if (screenfull.isEnabled) {
          screenfull.on('change', this.change)
        }
      },
      destroy() {
        if (screenfull.isEnabled) {
          screenfull.off('change', this.change)
        }
      },
    },
  }
</script>
