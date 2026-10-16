import { EXECUTOR } from '@presmium/kernel'
import type { RunOutput, RunResult } from '@presmium/kernel'
import type { CodeRunner, CodeRunnerOutput } from '@slidev/types'
import { defineCodeRunnersSetup } from '@slidev/types'
import DOMPurify from 'dompurify'
import { messages, whenService } from '../src/client/index.ts'
import { fallbackReason, withRecordedFallback } from '../src/domain/index.ts'

/** One output entry per line, as the built-in runners do for each console line. */
function lines(text: string, className?: string): CodeRunnerOutput[] {
  return text ? text.replace(/\n$/, '').split('\n').map(line => ({ text: line, class: className })) : []
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const joined = (value: unknown) => (Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : JSON.stringify(value, null, 2))

/**
 * A rich output as Slidev's runner shows HTML (docs/ir.md 6.1): an image, the
 * HTML sanitized (Slidev does not sanitize it), other types as text.
 */
function rich(output: RunOutput): CodeRunnerOutput[] {
  if (output.output_type === 'stream') return lines(joined(output.text), output.name === 'stderr' ? 'pm-run-stderr' : undefined)
  if (output.output_type === 'error') return [{ error: output.traceback.join('\n') || `${output.ename}: ${output.evalue}` }]
  const { data } = output
  const image = ['image/png', 'image/jpeg', 'image/gif'].find(type => data[type] !== undefined)
  if (image) return [{ html: `<img class="pm-run-image" alt="" src="data:${image};base64,${joined(data[image]).replace(/\s/g, '')}">` }]
  if (data['image/svg+xml'] !== undefined) return [{ html: `<img class="pm-run-image" alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(joined(data['image/svg+xml']))}">` }]
  if (data['text/html'] !== undefined) return [{ html: DOMPurify.sanitize(joined(data['text/html'])) }]
  const text = data['text/markdown'] ?? data['text/plain'] ?? data['application/json']
  return text === undefined ? [] : [{ html: `<pre class="pm-run-text">${escape(joined(text))}</pre>` }]
}

function outputs(result: RunResult): CodeRunnerOutput[] {
  const reason = fallbackReason(result)
  if (reason) return [{ text: messages().recordedLine(messages()[reason]), class: 'pm-run-recorded' }, ...lines(result.stdout)]
  if (result.outputs) {
    const shown = result.outputs.flatMap(rich)
    return result.ok || result.outputs.some(o => o.output_type === 'error') || !result.stderr ? shown : [...shown, { error: result.stderr }]
  }
  const shown = lines(result.stdout)
  if (result.stderr) shown.push(result.ok ? { text: result.stderr, class: 'pm-run-stderr' } : { error: result.stderr })
  return shown
}

/**
 * Monaco Runner support (Slidev's `{monaco-run}` code blocks, which the slides
 * renderer writes for code with `:run: live` or `both`) through the
 * `executor` service, so a block runs on the same executors as in the web
 * form: Pyodide for Python, the script worker for JavaScript and TypeScript,
 * or the executor of its environment. `runnerOptions` may set `executor` and
 * `session` (`:env:`, `:session:`, docs/ir.md 2.7), `timeout` (ms) and
 * `recorded` (output shown when the run fails or times out). Rich outputs
 * show as the runner's HTML.
 */
function runner(lang: string): CodeRunner {
  return async (code, { options }) => {
    const executor = await whenService(EXECUTOR)
    if (!executor) return { error: messages().unavailable }
    const text = (key: string) => (typeof options[key] === 'string' && options[key] ? options[key] as string : undefined)
    const timeoutMs = typeof options.timeout === 'number' ? options.timeout : undefined
    const result = await executor.run({ lang, code, timeoutMs, executor: text('executor'), session: text('session') })
    return outputs(withRecordedFallback(result, text('recorded')))
  }
}

export default defineCodeRunnersSetup(() => Object.fromEntries(
  ['python', 'py', 'python3', 'javascript', 'js', 'typescript', 'ts'].map(lang => [lang, runner(lang)]),
))
