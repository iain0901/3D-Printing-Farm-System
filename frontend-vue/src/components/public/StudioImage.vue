<template>
  <img
    class="studio-image workshop-art"
    :class="`studio-image--${imageKey}`"
    :src="`/images/studio/${imageKey}.webp`"
    :alt="decorative ? '' : alt || image.alt"
    :loading="priority ? 'eager' : 'lazy'"
    :fetchpriority="priority ? 'high' : 'auto'"
    decoding="async"
  />
</template>

<script>
  const imageByKind = {
    research: 'fdm-education',
    sketch: 'fdm-enclosure',
    engineering: 'fdm-robot-arm',
    batch: 'fdm-gear',
    exhibition: 'fdm-keychain',
    everyday: 'fdm-organizer',
    keepsake: 'fdm-case',
    rush: 'fdm-cable-clip',
    printer: 'fdm-workshop',
    spool: 'fdm-workshop',
    parts: 'fdm-tray',
    stand: 'fdm-industrial',
    vase: 'fdm-personal',
  }

  const altByImage = {
    'fdm-workshop': '橘色 FDM 線軸',
    'fdm-education': '黃綠色 FDM 格構立方體',
    'fdm-industrial': '橘色 FDM 手機架',
    'fdm-personal': '藍色 FDM 花瓶',
    'fdm-enclosure': '白色 FDM 電子外殼',
    'fdm-cable-clip': '珊瑚紅 FDM 線材固定夾',
    'fdm-organizer': '青綠色 FDM 桌面收納盒',
    'fdm-case': '紫色 FDM 翻蓋收納盒',
    'fdm-gear': '黃色 FDM 行星齒輪組',
    'fdm-tray': '深色 FDM 格構托盤',
    'fdm-robot-arm': '藍色 FDM 小型機械手臂',
    'fdm-keychain': '洋紅色 FDM 鑰匙圈吊飾',
  }

  export default {
    name: 'StudioImage',
    props: {
      kind: { type: String, default: 'printer' },
      alt: { type: String, default: '' },
      decorative: Boolean,
      priority: Boolean,
    },
    computed: {
      imageKey() {
        return imageByKind[this.kind] || 'fdm-workshop'
      },
      image() {
        return { alt: altByImage[this.imageKey] }
      },
    },
  }
</script>

<style scoped>
  .studio-image {
    display: block;
    width: 100%;
    height: auto;
    object-fit: cover;
  }
</style>
