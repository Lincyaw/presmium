import { createElement, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { stepStateAt } from '@lincyaw/kernel'
import type { ServiceToken, StepRange, StepState } from '@lincyaw/kernel/contracts'
import { HOST, installed } from './host-key.ts'
import type { HostAdapter, SharedStateScope } from './contracts.ts'
import { useStepScope } from './step-scope.ts'
import { runtimeRevision } from './runtime.ts'
import { createStore, useStore } from './store.ts'
import type { Store } from './store.ts'
import { PmBoundary } from './error-boundary.ts'

export function installHost(adapter: HostAdapter): void { installed.adapter = adapter }
export function HostProvider({ adapter, children }: { adapter: HostAdapter, children?: ReactNode }) {
  return createElement(HOST.Provider, { value: adapter }, children)
}
export function useHost(): HostAdapter {
  const host = useContext(HOST) ?? installed.adapter
  if (!host) throw new Error('[presmium] no host installed')
  return host
}
export function useDoc() { const host = useHost(); if (!host.useDoc) throw new Error("[presmium] this host has no document"); return host.useDoc() }
export function useStep(): number { return useHost().useStep() }
export function useStepState(range: StepRange): StepState { const step = useStep(); const scope = useStepScope(); return stepStateAt(range, scope.localStepAt(step)) }
export function useCursor() { return useHost().useCursor() }
export function useViewRole() { return useHost().useViewRole() }
export function usePresentationMode() { const host = useHost(); host.useViewRole(); return host.mode }
export function useService<T>(token: ServiceToken<T>): T | undefined { useStore(runtimeRevision); return useHost().getService(token) }
export function useStartReport() { useStore(runtimeRevision); return useHost().startReport() }
export function useStaticRender() { return useHost().useStaticRender() }
export function useSectionConfig(pluginId: string) { return useHost().useSectionConfig(pluginId) }
export interface SharedStateOptions { scope?: SharedStateScope }
export function useSharedState<T>(key: string, initial: T, options: SharedStateOptions = {}) { return useHost().useSharedState(key, initial, options.scope ?? 'local') }
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => { const query = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(query.matches); update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update) }, [])
  return reduced
}

const detachedShared = new Map<string, Store<unknown>>()
export function getSharedStateStore<T>(key: string, initial: T, options: SharedStateOptions = {}): Store<T> {
  const scope = options.scope ?? 'local'
  if (installed.adapter?.sharedStateStore) return installed.adapter.sharedStateStore(key, initial, scope)
  const id = `${scope}:${key}`
  let store = detachedShared.get(id); if (!store) { store = createStore<unknown>(initial); detachedShared.set(id, store) }
  return store as Store<T>
}
