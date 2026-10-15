<script setup lang="ts">
import { PmBoundary, useMessages, useService, useStartReport } from '@presmium/host'
import { computed } from 'vue'
import { DEMO_GREETING } from '../src/client/demo.ts'

const MESSAGES = {
  'zh-CN': { unavailable: '问候服务不可用', starting: '内核启动中……' },
  'en': { unavailable: 'The greeting service is unavailable', starting: 'Starting the kernel…' },
}

// The greeting is provided by presmium.demo.consumer using presmium.demo.provider's service.
const t = useMessages(MESSAGES)
const greeting = useService(DEMO_GREETING)
const report = useStartReport()
const text = computed(() => greeting.value ?? (report.value ? t.value.unavailable : t.value.starting))
</script>

<template>
  <PmBoundary name="PmDemoGreeting">
    <p class="pm-demo-greeting">
      {{ text }}
    </p>
  </PmBoundary>
</template>
