<template>
  <i v-if="iconClasses.length" :class="iconClasses" aria-hidden="true" />
</template>

<script>
  export default {
    name: 'VabIcon',
    props: {
      // 支援 Font Awesome 形式：['fas', 'crown'] 或 'crown'
      icon: {
        type: [String, Array],
        default: '',
      },
      pulse: {
        type: Boolean,
        default: false,
      },
    },
    computed: {
      iconClasses() {
        if (!this.icon) return []
        let icon = this.icon
        if (typeof icon === 'string') {
          icon = ['fas', String(icon).replace(/^fa-/, '')]
        }
        const [prefix, name] = icon
        return [
          prefix,
          `fa-${name}`,
          {
            'fa-pulse': this.pulse,
            'fa-spin': this.pulse,
          },
        ]
      },
    },
  }
</script>
