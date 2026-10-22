<template><slicer-lab :station-id="stationId" /></template>
<script setup>
import SlicerLab from '@/components/SlicerLab.vue'
defineProps({stationId:{type:String,required:true}})
</script>
