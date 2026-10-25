import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { currentLocale, OPERATIONS, useService, useStartReport, useStaticRender } from '@lincyaw/host'
import type { Operations } from '@lincyaw/host'
import { blockState, EXECUTOR, errorMessage, failedRun } from '@lincyaw/kernel'
import type { CodeNode, IRBlock, RecordedRun, RunRequest, RunResult } from '@lincyaw/kernel'
import { originBar } from '../../domain/index.ts'
import { useSectionContext } from '../section-context.ts'
import { viewerMessages } from '../viewer-messages.ts'
import { h } from '../element.ts'
import { CodeEditor } from './code-editor.ts'
import { CodeView, VariantView } from './code-view.ts'
import { isProseOutput, runOutput } from './outputs.ts'
export const CODE_OWNED = createContext(false)
const replays = new Set<(data: Record<string, unknown>) => void>()
const listening = new WeakSet<Operations>()
function listenRunReplays(operations: Operations) { if (listening.has(operations)) return; listening.add(operations); operations.onReplay('run', { apply: data => replays.forEach(replay => replay(data)) }) }
export function CodeBlockView(props: { block: IRBlock, step: number, expanded?: boolean }) {
  const owned = useContext(CODE_OWNED); const executor = useService(EXECUTOR); const operations = useService(OPERATIONS); const section = useSectionContext(); const report = useStartReport(); const printed = useStaticRender()
  const [live, setLive] = useState<RunResult>(); const [fallback, setFallback] = useState<string>(); const [running, setRunning] = useState(false); const [edited, setEdited] = useState<string>(); const [editing, setEditing] = useState(false); const [mounted, setMounted] = useState(false); const current = useRef<AbortController>()
  const node = props.block.node as CodeNode
  const stop = () => { current.current?.abort(); current.current = undefined; setRunning(false) }
  const show = (result: RunResult | undefined) => { const recorded = result && !result.ok && result.exitCode === null && node.outputs?.length; setFallback(recorded ? result.stderr.trim() || viewerMessages().code.unavailable : undefined); setLive(recorded ? undefined : result) }
  useEffect(() => { setMounted(true); return () => current.current?.abort() }, [])
  useEffect(() => { stop(); setLive(undefined); setFallback(undefined); setEdited(undefined); setEditing(false) }, [node.value])
  useEffect(() => { if (operations) listenRunReplays(operations); const replay = (data: Record<string, unknown>) => { if (data.block === props.block.id && (data.section === undefined || data.section === section?.section.id)) { stop(); show(undefined) } }; replays.add(replay); return () => { replays.delete(replay) } }, [operations, props.block.id, section?.section.id])
  const run = async () => {
    if (!node.run || !executor || running) return
    stop(); const controller = new AbortController(); current.current = controller; setRunning(true)
    const { lang, args, stdin, timeoutMs, executor: named, session } = node.run
    const request: RunRequest = { lang, code: edited ?? node.value, args, stdin, timeoutMs, executor: named, session, ...section ? { place: { section: section.section.id, block: props.block.id } } : {} }
    const started = Date.now(); let result: RunResult
    try { result = await executor.run(request, controller.signal) } catch (error) { result = failedRun(executor.id, viewerMessages().code.executorFailed(executor.id, errorMessage(error)), Date.now() - started) }
    if (controller.signal.aborted) return
    show(result); current.current = undefined; setRunning(false)
    const recording = node.outputs?.[0] as RecordedRun | undefined
    operations?.report({ type: 'run', data: { section: section?.section.id, block: props.block.id, result: !result.ok && recording ? `freeze:${recording.cacheKey}` : 'live' } })
  }
  const state = blockState(props.block, props.step); const variants = node.variants ?? []; const shown = variants.length && !props.expanded ? Math.min(state, variants.length - 1) : undefined
  const listings = !variants.length ? [h(CodeView, { lang: node.lang, value: node.value, highlight: props.expanded ? undefined : node.highlight?.[state] })] : shown === undefined ? variants.map(v => h('div', { key: v.label, className: 'pm-code-block__variant' }, [h('p', { className: 'pm-code-block__label' }, v.label), h(CodeView, { lang: node.lang, value: v.value })])) : [h(VariantView, { lang: node.lang, value: variants[shown]!.value })]
  const echo = node.echo !== false; const runnable = !owned && echo && node.run && node.run.when !== 'compile'; const editable = runnable && !variants.length && !node.highlight?.length && !printed; const t = viewerMessages().code; const available = mounted && executor
  if (editable && (editing || edited !== undefined)) listings.splice(0, listings.length, editing ? h(CodeEditor, { lang: node.lang, value: edited ?? node.value, onChange: setEdited, onRun: run }) : h(CodeView, { lang: node.lang, value: edited! }))
  const controls = runnable ? h('div', { className: 'pm-code-block__run' }, [h('button', { type: 'button', disabled: running || !available, onClick: run }, running ? t.running : live ? t.rerun : t.run), editable ? h('button', { type: 'button', className: 'pm-code-block__edit', 'aria-pressed': editing, onClick: () => setEditing(!editing) }, editing ? t.doneEditing : t.edit) : null, edited !== undefined && edited !== node.value ? h('button', { type: 'button', onClick: () => { setEdited(undefined); setEditing(false) } }, t.revert) : null, node.run?.session ? h('button', { type: 'button', disabled: !available, 'data-session': node.run.session, onClick: async () => { stop(); await executor?.endSession?.(node.run!.session!); show(undefined) } }, t.resetRunSession) : null, mounted && !executor && report ? h('span', { className: 'pm-code-block__hint' }, t.unavailable) : null]) : null
  const runs = owned ? [] : live ? [live] : node.outputs ?? []; const prose = !echo && !live && runs.length > 0 && runs.every(isProseOutput); const prefix = section?.section.id ?? props.block.id
  const outputs = runs.length ? h('div', { className: `pm-outputs${prose ? ' pm-outputs--prose' : ''}`, 'data-source': live ? 'live' : 'recorded' }, runs.map((r, i) => runOutput(r, (r as RecordedRun).cacheKey || i, prefix, { prose, note: fallback }))) : null
  const bar = originBar(node, shown, currentLocale())
  const origin = bar ? h('div', { className: 'pm-code-origin', 'data-anchor': bar.anchor }, bar.parts.map((part, key) => h(part.href ? 'a' : 'span', { key, className: `pm-code-origin__${part.kind}`, href: part.href, title: part.title, 'data-active': part.active ? '' : undefined, 'data-status': part.status, 'data-drift': part.drift }, part.text))) : null
  return h('div', { className: `pm-code-block${!echo ? ' pm-code-block--output-only' : ''}`, 'data-state': props.expanded ? undefined : state, 'data-run': runnable ? node.run!.when : undefined, 'data-session': node.run?.session }, echo ? [origin, ...listings, controls, outputs] : [outputs])
}
