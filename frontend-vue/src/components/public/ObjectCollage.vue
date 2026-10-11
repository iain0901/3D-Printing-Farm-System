<template>
  <div class="object-collage" :class="`object-collage--${composition.tone}`" aria-hidden="true">
    <span class="object-collage__arc"></span>
    <span class="object-collage__star object-collage__star--one">✦</span>
    <span class="object-collage__star object-collage__star--two">○</span>
    <studio-image :kind="composition.primary" decorative class="object-collage__image object-collage__image--primary" />
    <studio-image :kind="composition.secondary" decorative class="object-collage__image object-collage__image--secondary" />
    <studio-image :kind="composition.tertiary" decorative class="object-collage__image object-collage__image--tertiary" />
    <span class="object-collage__caption">FDM ／ 一層一層成型</span>
  </div>
</template>

<script>
  import StudioImage from './StudioImage.vue'

  const compositions = {
    research: { primary: 'research', secondary: 'printer', tertiary: 'everyday', tone: 'lime' },
    sketch: { primary: 'research', secondary: 'everyday', tertiary: 'printer', tone: 'lime' },
    engineering: { primary: 'engineering', secondary: 'printer', tertiary: 'research', tone: 'orange' },
    batch: { primary: 'engineering', secondary: 'research', tertiary: 'printer', tone: 'orange' },
    exhibition: { primary: 'engineering', secondary: 'everyday', tertiary: 'research', tone: 'orange' },
    everyday: { primary: 'everyday', secondary: 'research', tertiary: 'printer', tone: 'blue' },
    keepsake: { primary: 'everyday', secondary: 'printer', tertiary: 'research', tone: 'blue' },
    rush: { primary: 'printer', secondary: 'engineering', tertiary: 'research', tone: 'blue' },
    printer: { primary: 'printer', secondary: 'research', tertiary: 'everyday', tone: 'cyan' },
    spool: { primary: 'printer', secondary: 'engineering', tertiary: 'research', tone: 'cyan' },
    parts: { primary: 'engineering', secondary: 'printer', tertiary: 'everyday', tone: 'cyan' },
  }

  export default {
    name: 'ObjectCollage',
    components: { StudioImage },
    props: { kind: { type: String, default: 'printer' } },
    computed: {
      composition() {
        return compositions[this.kind] || compositions.printer
      },
    },
  }
</script>

<style scoped>
  .object-collage {
    position: relative;
    isolation: isolate;
    min-height: 245px;
    overflow: hidden;
  }
  .object-collage__arc {
    position: absolute;
    z-index: 0;
    inset: 7% 10% 8%;
    border: 1px solid currentColor;
    border-radius: 48% 48% 9% 9%;
    opacity: 0.45;
    transform: rotate(5deg);
  }
  .object-collage__image {
    position: absolute;
    z-index: 1;
    display: block;
    width: auto !important;
    height: auto !important;
    max-width: none !important;
    max-height: none !important;
    margin: 0 !important;
    aspect-ratio: auto !important;
    object-fit: contain !important;
    filter: drop-shadow(0 13px 9px #173c4348);
  }
  .object-collage__image--primary {
    width: 57% !important;
    right: 5%;
    bottom: 7%;
    transform: rotate(-8deg);
  }
  .object-collage__image--secondary {
    width: 39% !important;
    left: 6%;
    top: 5%;
    transform: rotate(10deg);
  }
  .object-collage__image--tertiary {
    width: 28% !important;
    left: 22%;
    bottom: 5%;
    transform: rotate(-10deg);
  }
  .object-collage__caption {
    position: absolute;
    z-index: 2;
    right: 7%;
    bottom: 2%;
    font-size: 9px;
    letter-spacing: 0.08em;
  }
  .object-collage__star {
    position: absolute;
    z-index: 2;
    font-family: Georgia, serif;
    line-height: 1;
  }
  .object-collage__star--one {
    top: 15%;
    right: 13%;
    font-size: 23px;
  }
  .object-collage__star--two {
    left: 11%;
    bottom: 18%;
    font-size: 24px;
  }
  .object-collage--lime {
    color: #356e50;
  }
  .object-collage--orange {
    color: #a84f30;
  }
  .object-collage--blue {
    color: #176f86;
  }
  .object-collage--cyan {
    color: #1b5060;
  }
  @media (max-width: 760px) {
    .object-collage {
      min-height: 218px;
    }
    .object-collage__image--primary {
      width: 54% !important;
    }
    .object-collage__image--secondary {
      width: 38% !important;
    }
    .object-collage__image--tertiary {
      width: 25% !important;
    }
  }
</style>
