<script setup lang="ts">
import type { PropType } from 'vue'
import { onMounted, ref, shallowRef, watchEffect } from 'vue'
import { provideToolbarPlace } from './design/components.ts'
import { useService } from './host.ts'
import { TOOLBAR } from './types.ts'
import type { ToolbarItem, ToolbarPlace } from './types.ts'

const props = defineProps({
  filter: { type: Function as PropType<(item: ToolbarItem) => boolean>, default: (item: ToolbarItem) => !item.slot || item.slot === 'tools' || item.slot === 'settings' },
  place: { type: String as PropType<ToolbarPlace>, default: 'bar' },
})

provideToolbarPlace(props.place)
const service = useService(TOOLBAR)
const items = shallowRef<ToolbarItem[]>([])
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})

watchEffect((onCleanup) => {
  const registry = service.value
  if (!registry) return
  const update = () => {
    items.value = registry.list().filter(props.filter)
  }
  update()
  onCleanup(registry.subscribe(update))
})
</script>

<template>
  <span v-if="mounted && items.length" class="pm-toolbar" :data-place="place">
    <component :is="item.component" v-for="item in items" :key="item.id" :data-toolbar-item="item.id" />
  </span>
</template>

<style scoped>
.pm-toolbar {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.pm-toolbar[data-place='status'] {
  gap: 1.125rem;
}
</style>
