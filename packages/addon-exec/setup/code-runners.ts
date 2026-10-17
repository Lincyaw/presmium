import { escapeHtml, EXECUTOR, isRecord } from '@presmium/kernel'
import type { RunOutput, RunResult } from '@presmium/kernel'
import { useNav } from '@slidev/client'
import type { CodeRunner, CodeRunnerOutput } from '@slidev/types'
import { defineCodeRunnersSetup } from '@slidev/types'
import DOMPurify from 'dompurify'
import { messages, whenService } from '../src/client/index.ts'

/** One output entry per line, as the built-in runners do for each console line. */
function lines(text: string, className?: string): CodeRunnerOutput[] {
  return text ? text.replace(/\n$/, '').split('\n').map(line => ({ text: line, class: className })) : []
}

const joined = (value: unknown) => (Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : JSON.stringify(value, null, 2))

/** What an image output's data may hold: base64, nothing else (an attribute value is never closed by it). */
const BASE64 = /^[A-Za-z0-9+/=]*$/

/**
 * A rich output as Slidev's runner shows HTML (docs/ir.md 6.1): an image of
 * base64 data (other data is dropped, saying so: it is untrusted, section 11),
 * the HTML sanitized (Slidev does not sanitize it), other types as text.
 */
function rich(output: RunOutput): CodeRunnerOutput[] {
  if (output.output_type === 'stream') return lines(joined(output.text), output.name === 'stderr' ? 'pm-run-stderr' : undefined)
  if (output.output_type === 'error') return [{ error: output.traceback.join('\n') || `${output.ename}: ${output.evalue}` }]
  const { data } = output
  const image = ['image/png', 'image/jpeg', 'image/gif'].find(type => data[type] !== undefined)
  if (image) {
    const base64 = joined(data[image]).replace(/\s/g, '')
    if (!BASE64.test(base64)) return [{ text: messages().droppedImage, class: 'pm-run-dropped' }]
    return [{ html: `<img class="pm-run-image" alt="" src="${escapeHtml(`data:${image};base64,${base64}`)}">` }]
  }
  if (data['image/svg+xml'] !== undefined) return [{ html: `<img class="pm-run-image" alt="" src="${escapeHtml(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(joined(data['image/svg+xml']))}`)}">` }]
  if (data['text/html'] !== undefined) return [{ html: DOMPurify.sanitize(joined(data['text/html'])) }]
  const text = data['text/markdown'] ?? data['text/plain'] ?? data['application/json']
  return text === undefined ? [] : [{ html: `<pre class="pm-run-text">${escapeHtml(joined(text))}</pre>` }]
}

/** What a run shows: its rich outputs, else its streams. */
function outputs(result: Pick<RunResult, 'ok' | 'stdout' | 'stderr' | 'outputs'>): CodeRunnerOutput[] {
  if (result.outputs) {
    const shown = result.outputs.flatMap(rich)
    return result.ok || result.outputs.some(o => o.output_type === 'error') || !result.stderr ? shown : [...shown, { error: result.stderr }]
  }
  const shown = lines(result.stdout)
  if (result.stderr) shown.push(result.ok ? { text: result.stderr, class: 'pm-run-stderr' } : { error: result.stderr })
  return shown
}

/** The output recorded at compile time that the slides renderer gives a runner (`recording` of its options), when there is one. */
type Recording = Pick<RunResult, 'ok' | 'stdout' | 'stderr' | 'outputs'>

function recordingOf(options: Record<string, unknown>): Recording | undefined {
  const value = options.recording
  if (!isRecord(value) || typeof value.stdout !== 'string' || typeof value.stderr !== 'string') return undefined
  return { ok: value.ok === true, stdout: value.stdout, stderr: value.stderr, ...Array.isArray(value.outputs) ? { outputs: value.outputs as RunOutput[] } : {} }
}

/** The recording, under a line that says it is one (and why it shows, or what it says about the run). */
function recorded(recording: Recording, why?: string): CodeRunnerOutput[] {
  const t = messages()
  return [{ text: why ? t.recordedLine(why) : t.recordedOutput, class: 'pm-run-recorded' }, ...outputs(recording)]
}

/**
 * The runners' options already shown once: a runner's first call, when its
 * slide loads (`autorun: 'once'`), shows the recording; it runs the code
 * only when asked (the run button). A printed slide (`slidev export`, the
 * browser exporter) always shows the recording: printing with clicks draws
 * the slide once per click, each a runner of its own with the same options.
 */
const shown = new WeakSet<object>()

function showsRecording(options: Record<string, unknown>): boolean {
  if (typeof options.block !== 'string') return false
  if (useNav().isPrintMode.value) return true
  if (shown.has(options)) return false
  shown.add(options)
  return true
}

/**
 * The languages of the runners: those the slides renderer writes as
 * `{monaco-run}` (Python, JavaScript, TypeScript, and C, C++, Ruby, SQL for
 * the WASI executor), with their usual aliases.
 */
const RUNNER_LANGS = ['python', 'py', 'python3', 'javascript', 'js', 'typescript', 'ts', 'c', 'cpp', 'c++', 'ruby', 'rb', 'sql']

/**
 * Monaco Runner support (Slidev's `{monaco-run}` code blocks, which the slides
 * renderer writes for code with `:run: live` or `both`) through the
 * `executor` service, so a block runs on the same executors as in the web
 * form: Pyodide for Python, the script worker for JavaScript and TypeScript,
 * the WASI executor for C, C++, Ruby and SQL, or the executor of its
 * environment. The renderer gives each block its options (`runnerOptions`):
 * `block` (its key), `executor` and `session` (`:env:`, `:session:`,
 * docs/ir.md 2.7), `timeout` (ms) and `recording`, the output recorded at
 * compile time. The runner's output area is the block's only one: until the
 * block is run it shows the recording, marked as one, or how to run the
 * code; a run that could not happen (no runtime, a timeout) shows the
 * recording with the reason (P-24). Rich outputs show as the runner's HTML.
 */
function runner(lang: string): CodeRunner {
  return async (code, { options }) => {
    const recording = recordingOf(options)
    if (showsRecording(options)) return recording ? recorded(recording) : [{ text: messages().runHint, class: 'pm-run-hint' }]
    const executor = await whenService(EXECUTOR)
    if (!executor) return recording ? recorded(recording, messages().unavailable) : [{ error: messages().unavailable }]
    const text = (key: string) => (typeof options[key] === 'string' && options[key] ? options[key] as string : undefined)
    const timeoutMs = typeof options.timeout === 'number' ? options.timeout : undefined
    const result = await executor.run({ lang, code, timeoutMs, executor: text('executor'), session: text('session') })
    if (recording && !result.ok && result.exitCode === null) return recorded(recording, result.timedOut ? messages().timedOut : result.stderr.trim() || messages().failed)
    return outputs(result)
  }
}

export default defineCodeRunnersSetup(() => Object.fromEntries(
  [...RUNNER_LANGS].map(lang => [lang, runner(lang)]),
))
