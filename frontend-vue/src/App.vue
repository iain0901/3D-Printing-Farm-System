<template>
  <div id="vue-admin-better">
    <router-view />
    <slicer-help />
    <site-agent />
  </div>
</template>

<script>
  import SlicerHelp from './components/SlicerHelp.vue'
  import SiteAgent from './components/SiteAgent.vue'
  export default {
    name: 'App',
    components: { SlicerHelp, SiteAgent },
    mounted() {},
  }
</script>
