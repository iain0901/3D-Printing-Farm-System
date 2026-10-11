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
    sketch: 'fdm-education',
    engineering: 'fdm-industrial',
    batch: 'fdm-industrial',
    exhibition: 'fdm-industrial',
    everyday: 'fdm-personal',
    keepsake: 'fdm-personal',
    rush: 'fdm-personal',
    printer: 'fdm-workshop',
    spool: 'fdm-workshop',
    parts: 'fdm-workshop',
  }

  const altByImage = {
    'fdm-workshop': 'FDM 3D 列印工作室與列印中的模型',
    'fdm-education': 'FDM 列印、研究原型與設計草圖的工作桌',
    'fdm-industrial': 'FDM 工業原型與小批量零件工作桌',
    'fdm-personal': 'FDM 個人創作、桌上小物與模型代印工作桌',
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
