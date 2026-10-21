import { iconMarkup, splitBlockKey } from '@lincyaw/host'
import { escapeHtml, EXECUTOR, isRecord } from '@lincyaw/kernel'
import type { RunOutput, RunResult } from '@lincyaw/kernel'
import { useNav } from '@slidev/client'
import type { CodeRunner, CodeRunnerOutput } from '@slidev/types'
import { defineCodeRunnersSetup } from '@slidev/types'
import DOMPurify from 'dompurify'
import { messages, whenService } from '../src/client/index.ts'

function lines(text: string, className?: string): CodeRunnerOutput[] {
  return text ? text.replace(/\n$/, '').split('\n').map(line => ({ text: line, class: className })) : []
}

const joined = (value: unknown) => (Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : JSON.stringify(value, null, 2))

const BASE64 = /^[A-Za-z0-9+/=]*$/

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

function outputs(result: Pick<RunResult, 'ok' | 'stdout' | 'stderr' | 'outputs'>): CodeRunnerOutput[] {
  if (result.outputs) {
    const shown = result.outputs.flatMap(rich)
    return result.ok || result.outputs.some(o => o.output_type === 'error') || !result.stderr ? shown : [...shown, { error: result.stderr }]
  }
  const shown = lines(result.stdout)
  if (result.stderr) shown.push(result.ok ? { text: result.stderr, class: 'pm-run-stderr' } : { error: result.stderr })
  return shown
}

type Recording = Pick<RunResult, 'ok' | 'stdout' | 'stderr' | 'outputs'>

function recordingOf(options: Record<string, unknown>): Recording | undefined {
  const value = options.recording
  if (!isRecord(value) || typeof value.stdout !== 'string' || typeof value.stderr !== 'string') return undefined
  return { ok: value.ok === true, stdout: value.stdout, stderr: value.stderr, ...Array.isArray(value.outputs) ? { outputs: value.outputs as RunOutput[] } : {} }
}

function recorded(recording: Recording, why?: string): CodeRunnerOutput[] {
  const t = messages()
  return [{ text: why ? t.recordedLine(why) : t.recordedOutput, class: 'pm-run-recorded' }, ...outputs(recording)]
}

const shown = new WeakSet<object>()

function showsRecording(options: Record<string, unknown>): boolean {
  if (typeof options.block !== 'string') return false
  if (useNav().isPrintMode.value) return true
  if (shown.has(options)) return false
  shown.add(options)
  return true
}

const RUNNER_LANGS = ['python', 'py', 'python3', 'javascript', 'js', 'typescript', 'ts', 'c', 'cpp', 'c++', 'ruby', 'rb', 'sql']

function runHint(): CodeRunnerOutput {
  return { html: `<span class="pm-run-hint">${messages().runHint(iconMarkup('play', '0.9em', 2))}</span>` }
}

function runner(lang: string): CodeRunner {
  return async (code, { options }) => {
    const recording = recordingOf(options)
    if (showsRecording(options)) return recording ? recorded(recording) : [runHint()]
    const executor = await whenService(EXECUTOR)
    if (!executor) return recording ? recorded(recording, messages().unavailable) : [{ error: messages().unavailable }]
    const text = (key: string) => (typeof options[key] === 'string' && options[key] ? options[key] as string : undefined)
    const timeoutMs = typeof options.timeout === 'number' ? options.timeout : undefined
    const place = text('block') && splitBlockKey(text('block')!)
    const result = await executor.run({ lang, code, timeoutMs, executor: text('executor'), session: text('session'), ...place ? { place: { section: place[0], block: place[1] } } : {} })
    if (recording && !result.ok && result.exitCode === null) return recorded(recording, result.timedOut ? messages().timedOut : result.stderr.trim() || messages().failed)
    return outputs(result)
  }
}

export default defineCodeRunnersSetup(() => Object.fromEntries(
  [...RUNNER_LANGS].map(lang => [lang, runner(lang)]),
))
