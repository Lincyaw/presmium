<script setup lang="ts">
// Shows the greeting service of fixture.host.consumer (../services), or why there is none.
import { useMessages, useService, useStartReport } from '@lincyaw/host'
import type { ServiceToken } from '@lincyaw/kernel'
import { computed } from 'vue'

const GREETING = Object.freeze({ id: 'fixture.host.greeting' }) as ServiceToken<string>

const MESSAGES = {
  'zh-CN': { unavailable: '问候服务不可用', starting: '内核启动中……' },
  'en': { unavailable: 'The greeting service is unavailable', starting: 'Starting the kernel…' },
}

const t = useMessages(MESSAGES)
const greeting = useService(GREETING)
const report = useStartReport()
const text = computed(() => greeting.value ?? (report.value ? t.value.unavailable : t.value.starting))
</script>

<template>
  <p class="demo-greeting">
    {{ text }}
  </p>
</template>
