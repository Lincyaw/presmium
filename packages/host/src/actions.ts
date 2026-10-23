import type { Ref } from 'vue'
import { getCurrentInstance, getCurrentScope, onMounted, onScopeDispose } from 'vue'
import { blockKeyOf } from './blocks.ts'
import type { Operations, ReplayHandler } from './contracts.ts'

/** A named action of a component; `seeking` is true while a player fast-forwards to a time. */
export type ComponentAction = (seeking: boolean) => void

export interface ActionOptions {
  /** Back to the look without any of the actions, before a player folds the actions up to a time. */
  clear?(): void
}

interface Registration {
  element: () => Element | undefined
  actions: Readonly<Record<string, ComponentAction>>
  clear?(): void
}

const registered = new Set<Registration>()
// The actions of each block since the last clear, in order: a player folds them up before the block's
// component exists (seeking into another section), and the component takes them up when it mounts.
const done = new Map<string, string[]>()
let operations: Operations | undefined

function record(block: string, action: string): void {
  done.set(block, [...done.get(block) ?? [], action])
}

function keyOf(element: Element | undefined): string | undefined {
  const block = element?.closest<HTMLElement>('.pm-block[data-block]')
  return block ? blockKeyOf(block) : undefined
}

/**
 * Names the actions of a component so that `{cue}`click <name>`` and the `click` operations of a
 * recorded lecture run them. Returns `run(name)`: it runs the action and reports it (a click of the
 * user, which a recording keeps). `element` is an element of the component, inside its block.
 */
export function useActions(element: Readonly<Ref<Element | undefined>>, actions: Readonly<Record<string, ComponentAction>>, options: ActionOptions = {}): (name: string) => void {
  const registration: Registration = { element: () => element.value, actions, clear: options.clear }
  registered.add(registration)
  if (getCurrentScope()) onScopeDispose(() => registered.delete(registration))
  if (getCurrentInstance()) {
    onMounted(() => {
      const block = keyOf(element.value)
      for (const name of block ? done.get(block) ?? [] : []) actions[name]?.(true)
    })
  }
  return (name) => {
    const action = actions[name]
    if (!action) return
    action(false)
    const block = keyOf(element.value)
    if (!block) return
    record(block, name)
    operations?.report({ type: 'click', data: { block, action: name } })
  }
}

/** The replay of `click`: the named action of the block's components. */
const clickReplay: ReplayHandler = {
  apply(data, seeking) {
    const { block, action } = data
    if (typeof block !== 'string' || typeof action !== 'string') return
    record(block, action)
    for (const registration of [...registered]) {
      const run = registration.actions[action]
      if (run && keyOf(registration.element()) === block) run(seeking)
    }
  },
  clear() {
    done.clear()
    for (const registration of [...registered]) registration.clear?.()
  },
}

/** Reports the actions to these operations and replays their `click`s. */
export function connectActions(to: Operations): void {
  operations = to
  to.onReplay('click', clickReplay)
}
