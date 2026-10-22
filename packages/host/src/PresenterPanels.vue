<script setup lang="ts">
import { PRESENTER_PANELS } from '@lincyaw/kernel'
import type { PresenterPanel } from '@lincyaw/kernel'
import { computed, shallowRef, watchEffect } from 'vue'
import { componentErrors } from './error-boundary.ts'
import { useService, useStartReport } from './host.ts'
import { useMessages } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'

const props = withDefaults(defineProps<{
  to?: string
  docked?: boolean
}>(), { to: 'body', docked: false })

const t = useMessages(HOST_MESSAGES)
const service = useService(PRESENTER_PANELS)
const report = useStartReport()
const panels = shallowRef<PresenterPanel[]>([])

watchEffect((onCleanup) => {
  const registry = service.value
  if (!registry) return
  const update = () => {
    panels.value = registry.list()
  }
  update()
  onCleanup(registry.subscribe(update))
})

const problems = computed(() => {
  const plugins = report.value?.plugins.filter(p => p.status === 'disabled' || p.status === 'failed').length ?? 0
  return plugins + componentErrors().length
})
</script>

<template>
  <Teleport :to="props.to" defer>
    <details v-if="service" class="pm-presenter-panels" :class="{ 'pm-presenter-panels--docked': props.docked }">
      <summary>
        {{ t.panels }} <span v-if="problems > 0" class="pm-presenter-panels__badge" :title="t.problems(problems)">{{ problems }}</span>
      </summary>
      <section v-for="panel in panels" :key="panel.id" :data-panel="panel.id">
        <h3>{{ panel.title }}</h3>
        <component :is="panel.component" />
      </section>
    </details>
  </Teleport>
</template>

<style scoped>
.pm-presenter-panels {
  position: fixed;
  right: 0.5rem;
  bottom: var(--pm-presenter-panels-bottom, 4.25rem);
  z-index: var(--pm-presenter-panels-z, 100);
  max-width: min(24rem, calc(25vw - 1rem));
  max-height: 50vh;
  overflow: auto;
  padding: 0.25rem 0.75rem;
  border: 1px solid var(--pm-color-line);
  border-radius: var(--pm-radius-small);
  background: var(--pm-color-surface);
  color: var(--pm-color-ink);
  font-size: 0.8rem;
  box-shadow: var(--pm-shadow-float);
}
.pm-presenter-panels--docked {
  position: static;
  max-width: none;
  max-height: none;
  margin-top: 1rem;
  box-shadow: none;
}
summary {
  cursor: pointer;
  font-weight: 600;
}
.pm-presenter-panels__badge {
  display: inline-block;
  min-width: 1.4em;
  padding: 0 0.3em;
  border-radius: var(--pm-radius-pill);
  background: var(--pm-color-danger);
  color: var(--pm-color-surface);
  text-align: center;
}
h3 {
  margin: 0.5rem 0 0.25rem;
  font-size: 0.85rem;
}
</style>
