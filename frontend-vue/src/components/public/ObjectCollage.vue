<template>
  <div v-if="artwork" class="object-collage">
    <span class="object-collage__type" aria-hidden="true">FDM</span>
    <studio-image :kind="artwork" class="object-collage__image" />
    <span class="object-collage__caption">FDM 應用示意物件</span>
  </div>
</template>
<script>
  import StudioImage from './StudioImage.vue'
  import { routeArtwork } from '@/content/publicArtwork.mjs'
  export default {
    name: 'ObjectCollage',
    components: { StudioImage },
    computed: {
      artwork() {
        return routeArtwork[this.$route.path]
      },
    },
  }
</script>
<style scoped>
  .object-collage {
    position: relative;
    isolation: isolate;
    width: 100%;
    height: 355px;
  }
  .object-collage__type {
    position: absolute;
    top: 8%;
    left: 8%;
    font: 900 clamp(70px, 9vw, 125px) / 1 Arial, sans-serif;
    letter-spacing: -0.07em;
    color: #17343d0d;
    z-index: -1;
  }
  .object-collage__image {
    display: block;
    width: 100% !important;
    height: 330px !important;
    max-height: none !important;
    aspect-ratio: auto !important;
    object-fit: contain !important;
    filter: drop-shadow(0 16px 12px #17343d13);
  }
  .object-collage__caption {
    position: absolute;
    bottom: 0;
    right: 15px;
    font-size: 10px;
    color: #617b7e;
  }
  @media (max-width: 760px) {
    .object-collage {
      height: 270px;
    }
    .object-collage__image {
      height: 250px !important;
    }
    .object-collage__type {
      font-size: 100px;
    }
  }
</style>
