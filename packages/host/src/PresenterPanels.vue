<script setup lang="ts">
// The presenter panels (the `presenterPanels` service); each host shows them in its presenter view only,
// beside what the presenter watches: in the web form in the presenter window's side column (`to`), in the
// slides form over the corner of the presenter view's notes.
import { PRESENTER_PANELS } from '@presmium/kernel'
import type { PresenterPanel } from '@presmium/kernel'
import { computed, shallowRef, watchEffect } from 'vue'
import { componentErrors } from './boundary.ts'
import { useService, useStartReport } from './host.ts'
import { useMessages } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'

const props = withDefaults(defineProps<{
  /** Where the panels go: a CSS selector, as `<Teleport to>` takes it. */
  to?: string
  /** Laid out in the flow of `to` (a side column) rather than fixed over the page. */
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
/* Over the corner of the presenter view's notes, above its navigation bar: clear of the current slide and its clicks. */
.pm-presenter-panels {
  position: fixed;
  right: 0.5rem;
  bottom: var(--pm-presenter-panels-bottom, 4.25rem);
  z-index: var(--pm-presenter-panels-z, 100);
  max-width: min(24rem, calc(25vw - 1rem));
  max-height: 50vh;
  overflow: auto;
  padding: 0.25rem 0.75rem;
  border: 1px solid rgba(125, 125, 125, 0.4);
  border-radius: 0.375rem;
  background: var(--slidev-theme-background, var(--vp-c-bg, #fff));
  color: inherit;
  font-size: 0.8rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
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
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  text-align: center;
}
h3 {
  margin: 0.5rem 0 0.25rem;
  font-size: 0.85rem;
}
</style>
