<template>
  <div class="part-color-picker">
    <div v-for="part in parts" :key="part.index" class="part-row">
      <span class="part-label">零件 {{ part.index + 1 }}</span>
      <span class="swatches">
        <span
          v-for="swatch in palette"
          :key="swatch"
          class="swatch"
          :class="{ active: normalize(colors[part.index]) === swatch }"
          :style="{ background: swatch }"
          @click="setColor(part.index, swatch)"
        />
        <el-color-picker v-model="customColors[part.index]" size="mini" @change="(hex) => setColor(part.index, hex)" />
      </span>
    </div>
  </div>
</template>

<script>
  const PALETTE = ['#f5f5f0', '#1c1c1c', '#d64545', '#3b6fd6', '#3f9142', '#e0b400', '#e07b28', '#8752c9']

  export default {
    name: 'PartColorPicker',
    props: {
      parts: { type: Array, required: true },
      colors: { type: Object, required: true },
    },
    data() {
      return {
        palette: PALETTE,
        customColors: {},
      }
    },
    methods: {
      normalize(hex) {
        return (hex || '').toLowerCase()
      },
      setColor(index, hex) {
        this.$emit('change', { index, color: hex })
      },
    },
  }
</script>

<style lang="scss" scoped>
  .part-color-picker {
    .part-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 6px;
    }

    .part-label {
      width: 64px;
      font-size: 13px;
      color: $base-color-gray;
    }

    .swatches {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .swatch {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid transparent;
      cursor: pointer;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.1) inset;

      &.active {
        border-color: $base-color-blue;
      }
    }
  }
</style>
