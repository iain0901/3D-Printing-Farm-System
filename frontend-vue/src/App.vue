<template>
  <div id="vue-admin-better">
    <router-view />
    <slicer-help />
  </div>
</template>

<script>
  import SlicerHelp from './components/SlicerHelp.vue'
  export default {
    name: 'App',
    components: { SlicerHelp },
    mounted() {},
  }
</script>
