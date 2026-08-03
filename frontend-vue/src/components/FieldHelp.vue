<template>
  <el-tooltip :content="text" placement="right" popper-class="field-help-tooltip">
    <i class="el-icon-question field-help-icon" @click.prevent />
  </el-tooltip>
</template>

<script>
  export default {
    name: 'FieldHelp',
    props: {
      text: { type: String, required: true },
    },
  }
</script>

<style lang="scss" scoped>
  .field-help-icon {
    color: $base-color-gray;
    cursor: help;
    font-size: 13px;
  }
</style>
