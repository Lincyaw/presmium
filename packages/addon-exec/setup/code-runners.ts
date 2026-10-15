import { EXECUTOR } from '@presmium/kernel'
import type { RunResult } from '@presmium/kernel'
import type { CodeRunner, CodeRunnerOutput } from '@slidev/types'
import { defineCodeRunnersSetup } from '@slidev/types'
import { messages, whenService } from '../src/client/index.ts'
import { fallbackReason, withRecordedFallback } from '../src/domain/index.ts'

/** One output entry per line, as the built-in runners do for each console line. */
function lines(text: string, className?: string): CodeRunnerOutput[] {
  return text ? text.replace(/\n$/, '').split('\n').map(line => ({ text: line, class: className })) : []
}

function outputs(result: RunResult): CodeRunnerOutput[] {
  const reason = fallbackReason(result)
  if (reason) return [{ text: messages().recordedLine(messages()[reason]), class: 'pm-run-recorded' }, ...lines(result.stdout)]
  const shown = lines(result.stdout)
  if (result.stderr) shown.push(result.ok ? { text: result.stderr, class: 'pm-run-stderr' } : { error: result.stderr })
  return shown
}

/**
 * Monaco Runner support (Slidev's `{monaco-run}` code blocks) through the
 * `executor` service, so a block runs on the same executors as the run panel:
 * Pyodide for Python, the script worker for JavaScript and TypeScript.
 * `runnerOptions` may set `timeout` (ms) and `recorded` (output shown when
 * the run fails or times out).
 */
function runner(lang: string): CodeRunner {
  return async (code, { options }) => {
    const executor = await whenService(EXECUTOR)
    if (!executor) return { error: messages().unavailable }
    const timeoutMs = typeof options.timeout === 'number' ? options.timeout : undefined
    const recorded = typeof options.recorded === 'string' ? options.recorded : undefined
    return outputs(withRecordedFallback(await executor.run({ lang, code, timeoutMs }), recorded))
  }
}

export default defineCodeRunnersSetup(() => Object.fromEntries(
  ['python', 'py', 'python3', 'javascript', 'js', 'typescript', 'ts'].map(lang => [lang, runner(lang)]),
))
