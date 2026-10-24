import { currentLocale, OPERATIONS, useService, useStartReport, useStaticRender } from '@lincyaw/host'
import type { Operations } from '@lincyaw/host'
import { blockState, EXECUTOR, errorMessage, failedRun } from '@lincyaw/kernel'
import type { CodeNode, IRBlock, RecordedRun, RunRequest, RunResult } from '@lincyaw/kernel'
import type { InjectionKey, PropType, Ref, VNode, VNodeChild } from 'vue'
import { defineComponent, h, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { originBar } from '../../domain/index.ts'
import type { OriginPart } from '../../domain/index.ts'
import { useSectionContext } from '../section-context.ts'
import { viewerMessages } from '../viewer-messages.ts'
import { CodeEditor } from './code-editor.ts'
import { CodeView, VariantView } from './code-view.ts'
import { isProseOutput, runOutput } from './outputs.ts'

function link(className: string, href: string | undefined, text: string, attrs: Record<string, unknown> = {}): VNode {
  return href
    ? h('a', { ...attrs, class: className, href, target: '_blank', rel: 'noopener' }, text)
    : h('span', { ...attrs, class: className }, text)
}

function originPart(part: OriginPart, k: number): VNode {
  return link(`pm-code-origin__${part.kind}`, part.href, part.text, {
    'key': `${part.kind}:${k}`,
    'title': part.title,
    'data-active': part.active ? '' : undefined,
    'data-status': part.status,
    'data-drift': part.drift,
  })
}

function renderOriginBar(node: CodeNode, shown: number | undefined): VNodeChild {
  const bar = originBar(node, shown, currentLocale())
  return bar ? h('div', { 'class': 'pm-code-origin', 'data-anchor': bar.anchor }, bar.parts.map(originPart)) : null
}

/** Whether the component around a code block owns it: the block then shows no run button and no outputs. */
export const CODE_OWNED: InjectionKey<Readonly<Ref<boolean>>> = Symbol('presmium.viewer.codeOwned')

const replays = new Set<(data: Record<string, unknown>) => void>()
const listening = new WeakSet<Operations>()

/** Handles the replay of `run` operations, once for each operations service, by passing them to the mounted code blocks. */
function listenRunReplays(operations: Operations): void {
  if (listening.has(operations)) return
  listening.add(operations)
  operations.onReplay('run', { apply: data => replays.forEach(replay => replay(data)) })
}

export const CodeBlockView = defineComponent({
  name: 'PmCodeBlock',
  props: {
    block: { type: Object as PropType<IRBlock>, required: true },
    step: { type: Number, required: true },
    expanded: Boolean,
  },
  setup(props) {
    const owned = inject(CODE_OWNED, undefined)
    const executor = useService(EXECUTOR)
    const operations = useService(OPERATIONS)
    const section = useSectionContext()
    const report = useStartReport()
    const live = shallowRef<RunResult>()
    const fallback = ref<string>()
    const running = ref(false)
    const mounted = ref(false)
    const printed = useStaticRender()
    // The code as the reader edited it, run in place of the block's own; and whether its editor is open.
    const edited = ref<string>()
    const editing = ref(false)
    let current: AbortController | undefined
    const stop = () => {
      current?.abort()
      current = undefined
      running.value = false
    }
    onMounted(() => {
      mounted.value = true
    })
    onBeforeUnmount(stop)
    const show = (result: RunResult | undefined) => {
      const node = props.block.node as CodeNode
      const recorded = result && !result.ok && result.exitCode === null && node.outputs?.length
      fallback.value = recorded ? result.stderr.trim() || viewerMessages().code.unavailable : undefined
      live.value = recorded ? undefined : result
    }
    const run = async () => {
      const node = props.block.node as CodeNode
      const router = executor.value
      if (!node.run || !router || running.value) return
      stop()
      const controller = new AbortController()
      current = controller
      running.value = true
      const { lang, args, stdin, timeoutMs, executor: named, session } = node.run
      const request: RunRequest = { lang, code: edited.value ?? node.value, args, stdin, timeoutMs, executor: named, session, ...section ? { place: { section: section.section.value.id, block: props.block.id } } : {} }
      const started = Date.now()
      let result: RunResult
      try {
        result = await router.run(request, controller.signal)
      } catch (error) {
        result = failedRun(router.id, viewerMessages().code.executorFailed(router.id, errorMessage(error)), Date.now() - started)
      }
      if (controller.signal.aborted) return
      show(result)
      current = undefined
      running.value = false
      const recording = node.outputs?.[0] as RecordedRun | undefined
      operations.value?.report({ type: 'run', data: { section: section?.section.value.id, block: props.block.id, result: fallback.value && recording ? `freeze:${recording.cacheKey}` : 'live' } })
    }
    const resetRunSession = async () => {
      const node = props.block.node as CodeNode
      if (!node.run?.session) return
      stop()
      await executor.value?.endSession?.(node.run.session)
      show(undefined)
    }
    const replay = (data: Record<string, unknown>) => {
      if (data.block !== props.block.id || (data.section !== undefined && data.section !== section?.section.value.id)) return
      stop()
      show(undefined)
    }
    watch(operations, (ops) => {
      if (ops) listenRunReplays(ops)
    }, { immediate: true })
    onMounted(() => replays.add(replay))
    onBeforeUnmount(() => replays.delete(replay))
    watch(() => (props.block.node as CodeNode).value, () => {
      stop()
      show(undefined)
      edited.value = undefined
      editing.value = false
    })

    return () => {
      const node = props.block.node as CodeNode
      const state = blockState(props.block, props.step)
      const variants = node.variants ?? []
      const shown = variants.length && !props.expanded ? Math.min(state, variants.length - 1) : undefined
      const listings = variants.length === 0
        ? [h(CodeView, { lang: node.lang, value: node.value, highlight: props.expanded ? undefined : node.highlight?.[state] })]
        : shown === undefined
          ? variants.map(v => h('div', { key: v.label, class: 'pm-code-block__variant' }, [h('p', { class: 'pm-code-block__label' }, v.label), h(CodeView, { lang: node.lang, value: v.value })]))
          : [h(VariantView, { key: 'variant', lang: node.lang, value: variants[shown]!.value })]
      const echo = node.echo !== false
      const runnable = !owned?.value && echo && node.run && node.run.when !== 'compile'
      // Code that runs as it is shown can be edited before it runs: not code shown in steps or variants, nor printed.
      const editable = runnable && !variants.length && !node.highlight?.length && !printed.value
      const t = viewerMessages().code
      const available = mounted.value && executor.value
      if (editable && (editing.value || edited.value !== undefined)) {
        listings.splice(0, listings.length, editing.value
          ? h(CodeEditor, { key: 'editor', lang: node.lang, value: edited.value ?? node.value, onChange: (value: string) => edited.value = value, onRun: run })
          : h(CodeView, { lang: node.lang, value: edited.value! }))
      }
      const controls = runnable
        ? h('div', { class: 'pm-code-block__run' }, [
            h('button', { type: 'button', disabled: running.value || !available, onClick: run }, running.value ? t.running : live.value ? t.rerun : t.run),
            editable ? h('button', { 'type': 'button', 'class': 'pm-code-block__edit', 'aria-pressed': String(editing.value), 'onClick': () => editing.value = !editing.value }, editing.value ? t.doneEditing : t.edit) : null,
            editable && edited.value !== undefined && edited.value !== node.value
              ? h('button', { type: 'button', class: 'pm-code-block__revert', onClick: () => {
                  edited.value = undefined
                  editing.value = false
                } }, t.revert)
              : null,
            node.run!.session ? h('button', { 'type': 'button', 'class': 'pm-code-block__reset', 'disabled': !available, 'data-session': node.run!.session, 'onClick': resetRunSession }, t.resetRunSession) : null,
            mounted.value && !executor.value && report.value ? h('span', { class: 'pm-code-block__hint' }, t.unavailable) : null,
          ])
        : null
      const runs = owned?.value ? [] : live.value ? [live.value] : node.outputs ?? []
      const prose = !echo && !live.value && runs.length > 0 && runs.every(isProseOutput)
      const prefix = section?.section.value.id ?? props.block.id
      const outputs = runs.length
        ? h('div', { 'class': ['pm-outputs', { 'pm-outputs--prose': prose }], 'data-source': live.value ? 'live' : 'recorded' }, runs.map((r, i) => runOutput(r, (r as RecordedRun).cacheKey || i, prefix, { prose, note: fallback.value })))
        : null
      return h('div', { 'class': ['pm-code-block', { 'pm-code-block--output-only': !echo }], 'data-state': props.expanded ? undefined : state, 'data-run': runnable ? node.run!.when : undefined, 'data-session': node.run?.session }, echo
        ? [renderOriginBar(node, shown), ...listings, controls, outputs]
        : [outputs])
    }
  },
})
