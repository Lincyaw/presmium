<script setup lang="ts">
// The server's answer through useServer(), or its degraded text in static output; asking for an approval.
import { useServer } from '@lincyaw/host'
import { ref, watchEffect } from 'vue'

const server = useServer()
const value = ref<string>()
const result = ref('')

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
</script>

<template>
  <div class="fixture-server">
    <p class="fixture-server__value">{{ server.available ? (value ?? '加载中') : '服务端不可用' }}</p>
    <button v-if="server.available" type="button" class="fixture-server__ask" @click="ask">请求确认</button>
    <p class="fixture-server__result">{{ result }}</p>
  </div>
</template>
