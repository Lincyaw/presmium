import { presmiumReport, presmiumService } from '@presmium/host'
import type { HostAdapter, ViewRole } from '@presmium/host'
import { stepStateAt } from '@presmium/kernel'
import { computed, inject } from 'vue'
import { FINAL_STEP } from '../domain/index.ts'
import { activeSlide, SECTION } from './section.ts'

/**
 * Document-form host adapter: steps come from the enclosing section (all
 * reached in a document section, scroll-driven in a scrolly one).
 */
export function createVitePressHost(): HostAdapter {
  const reader = computed((): ViewRole => 'reader')
  return {
    mode: 'document',
    useCursor() {
      const section = inject(SECTION, undefined)
      return computed(() => (section ? { slide: section.slide, step: section.step.value } : { slide: activeSlide.value, step: FINAL_STEP }))
    },
    useStepState(range) {
      const section = inject(SECTION, undefined)
      return computed(() => stepStateAt(range, section?.step.value ?? FINAL_STEP))
    },
    useViewRole: () => reader,
    getService: presmiumService,
    startReport: presmiumReport,
  }
}
