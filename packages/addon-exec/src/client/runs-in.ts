import { environmentExecutor } from '@lincyaw/kernel'
import type { EnvironmentSpec, Executor } from '@lincyaw/kernel'
import { createStore } from '@lincyaw/host'

export type RunsIn =
  | { kind: 'browser' }
  | { kind: 'machine' }
  | { kind: 'remote', name: string }
  | { kind: 'environment', name: string }

/** The environments of the deck's headmatter, which the plugin's setup records. */
export const declaredEnvironments = createStore<Readonly<Record<string, EnvironmentSpec>>>({})

/** The environment kinds of the other execution plugins, whose named executors do not say where they run. */
const KINDS: Record<string, RunsIn['kind']> = { wasi: 'browser', webgpu: 'browser', devcontainer: 'machine', jupyter: 'remote' }

/** Where the executor runs code: its own `runsIn`, or for a named environment the kind the headmatter declares. */
export function runsInOf(executorId: string | undefined, executor?: Executor): RunsIn | undefined {
  if (!executorId) return undefined
  const prefix = environmentExecutor('')
  if (executorId.startsWith(prefix)) {
    const name = executorId.slice(prefix.length)
    const kind = executor?.runsIn ?? KINDS[declaredEnvironments.getSnapshot()[name]?.kind ?? ''] ?? 'environment'
    return kind === 'browser' || kind === 'machine' ? { kind } : { kind, name }
  }
  return executor?.runsIn ? { kind: executor.runsIn } : undefined
}
