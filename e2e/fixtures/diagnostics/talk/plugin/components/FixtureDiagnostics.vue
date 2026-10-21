<script setup lang="ts">
import { PmBoundary } from '@lincyaw/host'
import { defineComponent, h, ref } from 'vue'

const failed = ref(false)
const CheckedContent = defineComponent({
  props: { fail: Boolean },
  setup(props) {
    if (props.fail) throw new Error('诊断运行错误')
    return () => h('p', '运行组件已恢复。')
  },
})
</script>

<template>
  <button type="button" @click="failed = true">触发运行错误</button>
  <button type="button" @click="failed = false">恢复组件</button>
  <PmBoundary name="FixtureDiagnostics" :reset-key="String(failed)">
    <CheckedContent :key="String(failed)" :fail="failed" />
  </PmBoundary>
</template>
