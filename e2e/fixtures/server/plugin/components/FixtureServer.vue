<script setup lang="ts">
// The server's answer through useServer(), or its degraded text in static output; asking for an approval;
// and answering one as deck code in an owner's page could try (same origin, and across to the owner console).
import { useServer } from '@presmium/host'
import { ref, watchEffect } from 'vue'

const server = useServer()
const value = ref<string>()
const result = ref('')
const approval = ref('')
const consoleUrl = ref('')
const answers = ref('')

watchEffect(() => {
  if (!server.available || value.value) return
  void server.fetch('fixture.server', 'value').then(response => response.json()).then((data: { value: string }) => {
    value.value = data.value
  })
})

async function ask() {
  result.value = '等待确认'
  const response = await server.fetch('fixture.server', 'approve', { method: 'POST' })
  result.value = (await response.json() as { allowed: boolean }).allowed ? '已允许' : '已拒绝'
}

async function answer() {
  const body = JSON.stringify({ type: 'answer', id: approval.value, allow: true })
  const same = await fetch('/__presmium/presmium.server/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    .then(async response => (await response.text(), String(response.status)), () => 'error')
  const across = await fetch(consoleUrl.value, { method: 'POST', mode: 'no-cors', credentials: 'include', headers: { 'Content-Type': 'text/plain' }, body })
    .then(response => response.type, () => 'error')
  answers.value = `same:${same} across:${across}`
}
</script>

<template>
  <div class="fixture-server">
    <p class="fixture-server__value">{{ server.available ? (value ?? '加载中') : '服务端不可用' }}</p>
    <button v-if="server.available" type="button" class="fixture-server__ask" @click="ask">请求确认</button>
    <p class="fixture-server__result">{{ result }}</p>
    <input v-model="approval" class="fixture-server__approval" aria-label="确认 ID">
    <input v-model="consoleUrl" class="fixture-server__console" aria-label="控制台地址">
    <button type="button" class="fixture-server__answer" @click="answer">代为允许</button>
    <p class="fixture-server__answers">{{ answers }}</p>
  </div>
</template>
