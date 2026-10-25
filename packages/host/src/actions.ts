import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { blockKeyOf } from './blocks.ts'
import type { Operations, ReplayHandler } from './contracts.ts'
export type ComponentAction = (seeking: boolean) => void
export interface ActionOptions { clear?(): void }
interface Registration { element(): Element | undefined, actions: Readonly<Record<string, ComponentAction>>, clear?(): void }
const registered = new Set<Registration>()
const done = new Map<string, string[]>()
let operations: Operations | undefined
const record = (block: string, action: string) => done.set(block, [...done.get(block) ?? [], action])
function keyOf(element: Element | null | undefined) { const block = element?.closest<HTMLElement>('.pm-block[data-block]'); return block ? blockKeyOf(block) : undefined }
export function useActions(element: RefObject<Element | null | undefined>, actions: Readonly<Record<string, ComponentAction>>, options: ActionOptions = {}): (name: string) => void {
  const current = useRef({ actions, options }); current.current = { actions, options }
  useEffect(() => { const registration: Registration = { element: () => element.current ?? undefined, get actions() { return current.current.actions }, clear: () => current.current.options.clear?.() }; registered.add(registration); const block = keyOf(element.current); for (const name of block ? done.get(block) ?? [] : []) current.current.actions[name]?.(true); return () => { registered.delete(registration) } }, [element])
  return name => { const action = current.current.actions[name]; if (!action) return; action(false); const block = keyOf(element.current); if (!block) return; record(block, name); operations?.report({ type: 'click', data: { block, action: name } }) }
}
const clickReplay: ReplayHandler = {
  apply(data, seeking) { if (typeof data.block !== 'string' || typeof data.action !== 'string') return; record(data.block, data.action); for (const registration of registered) { const action = registration.actions[data.action]; if (action && keyOf(registration.element()) === data.block) action(seeking) } },
  clear() { done.clear(); for (const registration of registered) registration.clear?.() },
}
export function connectActions(to: Operations): void { operations = to; to.onReplay('click', clickReplay) }
