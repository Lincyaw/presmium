import { currentLocale, OPERATIONS, usePrefersReducedMotion, useService, useStartReport } from '@lincyaw/host'
import type { Operations } from '@lincyaw/host'
import { blockState, EXECUTOR, errorMessage, failedRun } from '@lincyaw/kernel'
import type { CodeNode, IRBlock, RecordedRun, RunRequest, RunResult } from '@lincyaw/kernel'
import { ShikiMagicMove } from '@shikijs/magic-move/vue'
import '@shikijs/magic-move/style.css'
import type { Element, ElementContent, Root } from 'hast'
import { toHtml } from 'hast-util-to-html'
import type { PropType, VNode, VNodeChild } from 'vue'
import { computed, defineComponent, h, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { CODE_OWNED, useSectionContext } from './context.ts'
import { useDark } from './dark.ts'
import { codeColumns, originParts } from './domain/index.ts'
import type { OriginPart } from './domain/index.ts'
import { highlighterFor, THEMES } from './highlight.ts'
import { messages } from './i18n.ts'
import { proseOnly, runOutput } from './outputs.ts'

type Loaded = Awaited<ReturnType<typeof highlighterFor>>

function useHighlighter(lang: () => string) {
  const shiki = shallowRef<Loaded>()
  const load = async () => {
    const wanted = lang()
    const loaded = await highlighterFor(wanted).catch(() => undefined)
    if (wanted === lang()) shiki.value = loaded
  }
  onMounted(load)
  watch(lang, load)
  return shiki
}

function lineElements(tree: Root): Element[] {
  const pre = tree.children.find((node): node is Element => node.type === 'element')
  const code = pre?.children.find((node): node is Element => node.type === 'element' && node.tagName === 'code')
  return (code?.children ?? []).filter((node: ElementContent): node is Element => node.type === 'element')
}

export const CodeView = defineComponent({
  name: 'PmCodeView',
  props: {
    lang: { type: String, default: '' },
    value: { type: String, required: true },
    highlight: { type: Array as PropType<number[]>, default: undefined },
  },
  setup(props) {
    const shiki = useHighlighter(() => props.lang)
    const code = computed(() => props.value.replace(/\n$/, ''))
    const lines = computed(() => new Set(props.highlight ?? []))
    const tree = computed(() => shiki.value && shiki.value.highlighter.codeToHast(code.value, { lang: shiki.value.lang, themes: THEMES, defaultColor: false }))
    const html = computed(() => {
      if (!tree.value) return undefined
      const marked = lines.value
      lineElements(tree.value).forEach((line, i) => {
        line.properties.class = marked.has(i + 1) ? 'line highlighted' : 'line'
      })
      return toHtml(tree.value)
    })
    const columns = computed(() => codeColumns(code.value))
    return () => {
      const attrs = {
        'class': ['pm-code', { 'pm-code--highlight': lines.value.size > 0 }],
        'style': { '--pm-code-columns': columns.value },
        'data-lang': props.lang || undefined,
      }
      if (html.value) return h('div', { ...attrs, key: 'shiki', innerHTML: html.value })
      const rows = code.value.split('\n').flatMap((text, i) => [h('span', { class: ['line', { highlighted: lines.value.has(i + 1) }] }, text), '\n'])
      return h('div', { ...attrs, key: 'plain' }, [h('pre', { class: 'shiki' }, [h('code', rows.slice(0, -1))])])
    }
  },
})

const VariantView = defineComponent({
  name: 'PmCodeVariant',
  props: {
    lang: { type: String, default: '' },
    value: { type: String, required: true },
  },
  setup(props) {
    const shiki = useHighlighter(() => props.lang)
    const reduced = usePrefersReducedMotion()
    const dark = useDark()
    const code = computed(() => props.value.replace(/\n$/, ''))
    return () => {
      const loaded = shiki.value
      if (!loaded || reduced.value) return h(CodeView, { lang: props.lang, value: props.value })
      return h('div', { 'class': 'pm-code pm-code--magic-move', 'style': { '--pm-code-columns': codeColumns(code.value) }, 'data-lang': props.lang || undefined }, [
        h(ShikiMagicMove, { highlighter: loaded.highlighter, lang: loaded.lang, theme: dark.value ? THEMES.dark : THEMES.light, code: code.value, options: { duration: 500 } }),
      ])
    }
  },
})

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

function originBar(node: CodeNode, shown: number | undefined): VNodeChild {
  const bar = originParts(node, shown, currentLocale())
  return bar ? h('div', { 'class': 'pm-code-origin', 'data-anchor': bar.anchor }, bar.parts.map(originPart)) : null
}

const replays = new Set<(data: Record<string, unknown>) => void>()
const followed = new WeakSet<Operations>()

function followRuns(operations: Operations): void {
  if (followed.has(operations)) return
  followed.add(operations)
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
      fallback.value = recorded ? result.stderr.trim() || messages().code.unavailable : undefined
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
      const request: RunRequest = { lang, code: node.value, args, stdin, timeoutMs, executor: named, session, ...section ? { place: { section: section.section.value.id, block: props.block.id } } : {} }
      const started = Date.now()
      let result: RunResult
      try {
        result = await router.run(request, controller.signal)
      } catch (error) {
        result = failedRun(router.id, messages().code.executorFailed(router.id, errorMessage(error)), Date.now() - started)
      }
      if (controller.signal.aborted) return
      show(result)
      current = undefined
      running.value = false
      const recording = node.outputs?.[0] as RecordedRun | undefined
      operations.value?.report({ type: 'run', data: { section: section?.section.value.id, block: props.block.id, result: fallback.value && recording ? `freeze:${recording.cacheKey}` : 'live' } })
    }
    const reset = async () => {
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
      if (ops) followRuns(ops)
    }, { immediate: true })
    onMounted(() => replays.add(replay))
    onBeforeUnmount(() => replays.delete(replay))
    watch(() => (props.block.node as CodeNode).value, () => {
      stop()
      show(undefined)
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
      const t = messages().code
      const available = mounted.value && executor.value
      const controls = runnable
        ? h('div', { class: 'pm-code-block__run' }, [
            h('button', { type: 'button', disabled: running.value || !available, onClick: run }, running.value ? t.running : live.value ? t.rerun : t.run),
            node.run!.session ? h('button', { 'type': 'button', 'class': 'pm-code-block__reset', 'disabled': !available, 'data-session': node.run!.session, 'onClick': reset }, t.resetSession) : null,
            mounted.value && !executor.value && report.value ? h('span', { class: 'pm-code-block__hint' }, t.unavailable) : null,
          ])
        : null
      const runs = owned?.value ? [] : live.value ? [live.value] : node.outputs ?? []
      const prose = !echo && !live.value && runs.length > 0 && runs.every(proseOnly)
      const prefix = section?.section.value.id ?? props.block.id
      const outputs = runs.length
        ? h('div', { 'class': ['pm-outputs', { 'pm-outputs--prose': prose }], 'data-source': live.value ? 'live' : 'recorded' }, runs.map((r, i) => runOutput(r, (r as RecordedRun).cacheKey || i, prefix, { prose, note: fallback.value })))
        : null
      return h('div', { 'class': ['pm-code-block', { 'pm-code-block--output-only': !echo }], 'data-state': props.expanded ? undefined : state, 'data-run': runnable ? node.run!.when : undefined, 'data-session': node.run?.session }, echo
        ? [originBar(node, shown), ...listings, controls, outputs]
        : [outputs])
    }
  },
})
