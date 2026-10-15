<script setup lang="ts">
import { componentErrors, useStartReport } from '@presmium/host'
import type { PluginStatus } from '@presmium/kernel'
import { computed } from 'vue'

const LABELS: Record<PluginStatus, string> = {
  started: '已启动',
  degraded: '已降级',
  disabled: '已禁用',
  failed: '启动失败',
}

const report = useStartReport()
const errors = computed(componentErrors)
</script>

<template>
  <p v-if="!report">
    内核启动中……
  </p>
  <p v-else-if="report.plugins.length === 0">
    没有注册插件。
  </p>
  <ul v-else class="pm-start-report">
    <li v-for="plugin in report.plugins" :key="plugin.id" :data-plugin="plugin.id" :data-status="plugin.status">
      <code>{{ plugin.id }}</code> {{ LABELS[plugin.status] }}<span v-if="plugin.reason">：{{ plugin.reason }}</span>
    </li>
  </ul>
  <ul v-if="errors.length > 0" class="pm-component-errors">
    <li v-for="error in errors" :key="`${error.component}:${error.message}`" :data-component="error.component">
      组件 <code>{{ error.component }}</code> 出错：{{ error.message }}
    </li>
  </ul>
</template>

<style scoped>
ul {
  margin: 0;
  padding-left: 1.2em;
}
li[data-status='disabled'],
li[data-status='failed'],
.pm-component-errors li {
  color: #dc2626;
}
li[data-status='degraded'] {
  color: #d97706;
}
</style>
