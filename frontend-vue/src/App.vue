<template>
  <div id="vue-admin-better">
    <router-view />
    <slicer-help />
    <site-agent />
    <demo-notice />
  </div>
</template>

<script>
  import SlicerHelp from './components/SlicerHelp.vue'
  import SiteAgent from './components/SiteAgent.vue'
  import DemoNotice from './components/DemoNotice.vue'
  export default {
    name: 'App',
    components: { SlicerHelp, SiteAgent, DemoNotice },
    mounted() {},
  }
</script>
