<template>
  <section class="site-hero dark-canvas layer-lines" :class="{ slim }">
    <div class="inner">
      <p class="mono-label">{{ eyebrow }}</p>
      <h1 class="h-display" v-html="title" />
      <p v-if="lead" class="lead">{{ lead }}</p>
      <slot />
    </div>
  </section>
</template>

<script>
  export default {
    name: 'SiteHero',
    props: {
      eyebrow: { type: String, default: '3DRFM' },
      title: { type: String, required: true },
      lead: { type: String, default: '' },
      slim: { type: Boolean, default: false },
    },
  }
</script>

<style lang="scss" scoped>
  .site-hero {
    padding: 86px 24px 70px;
    text-align: center;

    &.slim {
      padding: 56px 24px 46px;
    }

    .inner {
      max-width: 860px;
      margin: auto;
    }
    .lead {
      max-width: 700px;
      margin: auto;
    }
  }
</style>
