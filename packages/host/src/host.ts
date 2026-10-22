import { stepStateAt } from '@lincyaw/kernel'
import type { PresentationMode, ServiceToken, StartReport, StepRange, StepState } from '@lincyaw/kernel/contracts'
import type { App, ComputedRef, Ref } from 'vue'
import { computed, getCurrentInstance, getCurrentScope, inject, onScopeDispose, readonly, ref } from 'vue'
import { PmBoundary } from './error-boundary.ts'
import { HOST, installed } from './host-key.ts'
import { PmStepScope, useStepScope } from './step-scope.ts'
import type { HostAdapter, SharedStateScope } from './contracts.ts'

export function installHost(app: App, adapter: HostAdapter): void {
  installed.adapter = adapter
  app.provide(HOST, adapter)
  app.component('PmBoundary', PmBoundary)
  app.component('PmStepScope', PmStepScope)
}

export function useHost(): HostAdapter {
  const host = inject(HOST, undefined)
  if (!host) throw new Error('[presmium] no host installed: the host adapter must call installHost(app, adapter)')
  return host
}

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

export function useService<T>(token: ServiceToken<T>): ComputedRef<T | undefined> {
  const host = useHost()
  return computed(() => host.getService(token))
}

export function useStartReport(): ComputedRef<StartReport | undefined> {
  const host = useHost()
  return computed(() => host.startReport())
}

export function useStaticRender(): Readonly<Ref<boolean>> {
  return useHost().useStaticRender()
}

export function useSectionConfig(pluginId: string): Readonly<Ref<Record<string, unknown>>> {
  return useHost().useSectionConfig(pluginId)
}

export interface SharedStateOptions {
  scope?: SharedStateScope
}

export function useSharedState<T>(key: string, initial: T, options: SharedStateOptions = {}): Ref<T> {
  const host = (getCurrentInstance() ? inject(HOST, undefined) : undefined) ?? installed.adapter
  if (!host) throw new Error('[presmium] no host installed: the host adapter must call installHost(app, adapter)')
  return host.useSharedState(key, initial, options.scope ?? 'local')
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

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
