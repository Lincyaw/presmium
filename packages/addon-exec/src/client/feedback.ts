import type { ExecutorRouter, RunRequest, RunResult } from '@lincyaw/kernel'
import { mimeText } from '../domain/index.ts'

const LIMIT = 8
const TEXT_LIMIT = 2000

interface Feedback {
  id: number
  at: number
  type: 'run' | 'reset-session'
  state: 'running' | 'succeeded' | 'failed' | 'timed-out' | 'reset'
  section?: string
  block?: string
  lang?: string
  session?: string
  executor?: string
  exitCode?: number | null
  source?: 'live' | 'recorded'
  durationMs?: number
  stdout?: string
  stderr?: string
  value?: string
  displayTypes?: string[]
  truncated?: boolean
}

function resultInfo(result: RunResult): Partial<Feedback> {
  const values = result.outputs?.flatMap(output => output.output_type === 'execute_result'
    ? [output.data['text/plain'] ?? output.data['text/markdown'] ?? output.data['application/json']]
    : []) ?? []
  const value = values.map(value => mimeText(value)).join('\n')
  const displayTypes = [...new Set(result.outputs?.flatMap(output => output.output_type === 'execute_result' || output.output_type === 'display_data' ? Object.keys(output.data) : []) ?? [])]
  return {
    state: result.timedOut ? 'timed-out' : result.ok ? 'succeeded' : 'failed',
    executor: result.executorId,
    exitCode: result.exitCode,
    source: result.source,
    durationMs: result.durationMs,
    stdout: result.stdout.slice(0, TEXT_LIMIT),
    stderr: result.stderr.slice(0, TEXT_LIMIT),
    ...value ? { value: value.slice(0, TEXT_LIMIT) } : {},
    ...displayTypes.length ? { displayTypes } : {},
    ...[result.stdout, result.stderr, value].some(text => text.length > TEXT_LIMIT) ? { truncated: true } : {},
  }
}

/** Status follows the shared execution boundary, so every browser executor reports the same way. */
export function withRuntimeFeedback(router: ExecutorRouter): { executor: ExecutorRouter, read(): { recent: Feedback[] } } {
  let sequence = 0
  let recent: Feedback[] = []
  const add = (entry: Feedback) => { recent = [...recent, entry].slice(-LIMIT) }
  return {
    read: () => ({ recent }),
    executor: {
      ...router,
      async run(request: RunRequest, signal?: AbortSignal) {
        const id = ++sequence
        add({ id, at: Date.now(), type: 'run', state: 'running', lang: request.lang, ...request.place ? { section: request.place.section, block: request.place.block } : {}, ...request.session ? { session: request.session } : {} })
        const result = await router.run(request, signal)
        recent = recent.map(entry => entry.id === id ? { ...entry, ...resultInfo(result) } : entry)
        return result
      },
      async endSession(session) {
        await router.endSession?.(session)
        add({ id: ++sequence, at: Date.now(), type: 'reset-session', state: 'reset', session })
      },
    },
  }
}
