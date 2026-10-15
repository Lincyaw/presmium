import { EXECUTOR } from '@presmium/kernel'
import type { RunResult } from '@presmium/kernel'
import type { CodeRunner, CodeRunnerOutput } from '@slidev/types'
import { defineCodeRunnersSetup } from '@slidev/types'
import { whenService } from '../src/client/index.ts'
import { fallbackReason, withRecordedFallback } from '../src/domain/index.ts'

/** One output entry per line, as the built-in runners do for each console line. */
function lines(text: string, className?: string): CodeRunnerOutput[] {
  return text ? text.replace(/\n$/, '').split('\n').map(line => ({ text: line, class: className })) : []
}

function outputs(result: RunResult): CodeRunnerOutput[] {
  const reason = fallbackReason(result)
  if (reason) return [{ text: `预录输出（${reason}）`, class: 'pm-run-recorded' }, ...lines(result.stdout)]
  const shown = lines(result.stdout)
  if (result.stderr) shown.push(result.ok ? { text: result.stderr, class: 'pm-run-stderr' } : { error: result.stderr })
  return shown
}

/**
 * Monaco Runner support for Python (`{monaco-run}` code blocks), through the
 * `executor` service. `runnerOptions` may set `timeout` (ms) and `recorded`
 * (output shown when the run fails or times out).
 */
const python: CodeRunner = async (code, { options }) => {
  const executor = await whenService(EXECUTOR)
  if (!executor) return { error: 'executor 服务不可用' }
  const timeoutMs = typeof options.timeout === 'number' ? options.timeout : undefined
  const recorded = typeof options.recorded === 'string' ? options.recorded : undefined
  return outputs(withRecordedFallback(await executor.run({ lang: 'python', code, timeoutMs }), recorded))
}

export default defineCodeRunnersSetup(() => ({ python, py: python, python3: python }))
