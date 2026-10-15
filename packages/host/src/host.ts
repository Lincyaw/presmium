import { stepStateAt } from '@presmium/kernel/contracts'
import type { PresentationMode, ServiceToken, StartReport, StepRange, StepState } from '@presmium/kernel/contracts'
import type { App, ComputedRef, InjectionKey, Ref } from 'vue'
import { computed, getCurrentScope, inject, onScopeDispose, readonly, ref } from 'vue'
import { PmBoundary } from './boundary.ts'
import { PmStepScope, useStepScope } from './scope.ts'
import type { HostAdapter } from './types.ts'

const HOST: InjectionKey<HostAdapter> = Symbol('presmium.host')

/** Called by a host adapter when the app is created. Also registers `PmBoundary` and `PmStepScope` globally. */
export function installHost(app: App, adapter: HostAdapter): void {
  app.provide(HOST, adapter)
  app.component('PmBoundary', PmBoundary)
  app.component('PmStepScope', PmStepScope)
}

/** The installed host adapter. Must be called inside a component setup. */
export function useHost(): HostAdapter {
  const host = inject(HOST, undefined)
  if (!host) throw new Error('[presmium] no host installed: the host adapter must call installHost(app, adapter)')
  return host
}

/**
 * The state of a range of the component's internal steps: steps count from
 * the enclosing step scope, so step k of the range is the block's state k,
 * shown at step `at + k` of the slide or section (docs/ir.md section 2.4).
 * Must be called inside a component setup.
 */
export function useStepState(range: StepRange): Readonly<Ref<StepState>> {
  const step = useHost().useStep()
  const { at } = useStepScope()
  return computed(() => stepStateAt(range, step.value - at.value))
}

export function useCursor() {
  return useHost().useCursor()
}

export function useViewRole() {
  return useHost().useViewRole()
}

export function usePresentationMode(): PresentationMode {
  return useHost().mode
}

/** The service implementation; undefined until the kernel has started or when no plugin provides it. */
export function useService<T>(token: ServiceToken<T>): ComputedRef<T | undefined> {
  const host = useHost()
  return computed(() => host.getService(token))
}

/** The kernel start report; undefined until the kernel has started. */
export function useStartReport(): ComputedRef<StartReport | undefined> {
  const host = useHost()
  return computed(() => host.startReport())
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** True while the system asks for reduced motion (N-06); animations then show their final state. */
export function usePrefersReducedMotion(): Readonly<Ref<boolean>> {
  const query = typeof window === 'undefined' ? undefined : window.matchMedia?.(REDUCED_MOTION)
  const reduced = ref(query?.matches ?? false)
  if (query) {
    const update = (event: MediaQueryListEvent) => {
      reduced.value = event.matches
    }
    query.addEventListener('change', update)
    if (getCurrentScope()) onScopeDispose(() => query.removeEventListener('change', update))
  }
  return readonly(reduced)
}
