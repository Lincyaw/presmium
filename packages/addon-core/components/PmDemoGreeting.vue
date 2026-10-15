<script setup lang="ts">
import { PmBoundary, useService, useStartReport } from '@presmium/host'
import { computed } from 'vue'
import { DEMO_GREETING } from '../src/client/demo.ts'

// The greeting is provided by presmium.demo.consumer using presmium.demo.provider's service.
const greeting = useService(DEMO_GREETING)
const report = useStartReport()
const text = computed(() => greeting.value ?? (report.value ? '问候服务不可用' : '内核启动中……'))
</script>

<template>
  <PmBoundary name="PmDemoGreeting">
    <p class="pm-demo-greeting">
      {{ text }}
    </p>
  </PmBoundary>
</template>
