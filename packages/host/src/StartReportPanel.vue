<script setup lang="ts">
import { computed } from 'vue'
import { componentErrors } from './error-boundary.ts'
import { useStartReport } from './host.ts'
import { useMessages } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'

const t = useMessages(HOST_MESSAGES)
const report = useStartReport()
const errors = computed(componentErrors)
</script>

<template>
  <p v-if="!report">
    {{ t.starting }}
  </p>
  <p v-else-if="report.plugins.length === 0">
    {{ t.noPlugins }}
  </p>
  <ul v-else class="pm-start-report">
    <li v-for="plugin in report.plugins" :key="plugin.id" :data-plugin="plugin.id" :data-status="plugin.status">
      <code>{{ plugin.id }}</code> {{ t.status[plugin.status] }}<span v-if="plugin.reason">{{ t.because }}{{ plugin.reason }}</span>
    </li>
  </ul>
  <ul v-if="errors.length > 0" class="pm-component-errors">
    <li v-for="error in errors" :key="`${error.component}:${error.message}`" :data-component="error.component">
      {{ t.componentError(error.component, error.message) }}
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
