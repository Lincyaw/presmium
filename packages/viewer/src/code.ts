import { currentLocale, usePrefersReducedMotion, useService, useStartReport } from '@presmium/host'
import { EXECUTOR, errorMessage, failedRun } from '@presmium/kernel'
import type { CodeNode, IRBlock, RunResult } from '@presmium/kernel'
import { ShikiMagicMove } from '@shikijs/magic-move/vue'
import '@shikijs/magic-move/style.css'
import type { Element, ElementContent, Root } from 'hast'
import { toHtml } from 'hast-util-to-html'
import type { PropType, VNode, VNodeChild } from 'vue'
import { computed, defineComponent, h, inject, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { IN_COMPONENT } from './context.ts'
import { useDark } from './dark.ts'
import { blockState, codeColumns, originParts, outputNotes } from './domain/index.ts'
import type { OriginPart } from './domain/index.ts'
import { highlighterFor, THEMES } from './highlight.ts'
import { messages } from './i18n.ts'

type Loaded = Awaited<ReturnType<typeof highlighterFor>>

/** The grammar of `lang` once loaded in the browser; undefined before, and for languages without one. */
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

/** The lines of Shiki's tree: `pre > code > span.line`. */
function lineElements(tree: Root): Element[] {
  const pre = tree.children.find((node): node is Element => node.type === 'element')
  const code = pre?.children.find((node): node is Element => node.type === 'element' && node.tagName === 'code')
  return (code?.children ?? []).filter((node: ElementContent): node is Element => node.type === 'element')
}

/**
 * A code listing with highlighted lines. It renders plain lines first (server
 * render, hydration) and switches to Shiki once the grammar has loaded. The
 * code is tokenized once; a step that highlights other lines only changes
 * the lines' classes.
 */
export const CodeView = defineComponent({
  name: 'PmCodeView',
  props: {
    lang: { type: String, default: '' },
    value: { type: String, required: true },
    /** 1-based lines to highlight; the others are dimmed. */
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
        line.properties.className = marked.has(i + 1) ? ['line', 'highlighted'] : ['line']
      })
      return toHtml(tree.value)
    })
    // Where code shrinks to fit (the stage of a scrolly section), the width of its widest line sets the size.
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

/**
 * The versions of a listing shown one per step (P-16): the version of the
 * step, which morphs from one version to the next with Shiki Magic Move (the
 * library of the slides form); with reduced motion, or before the grammar
 * has loaded, the version replaces the previous one at once.
 */
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

/**
 * Where the code comes from (`CodeNode.origin`, `originParts`): file and
 * lines linked to the repository (those of the version on screen), the
 * pinned commit or the commit of each version (the shown one marked), and a
 * badge, with its explanation, when the pinned code drifted or the anchor
 * moved. The slides form shows the same parts.
 */
function originBar(node: CodeNode, shown: number | undefined): VNodeChild {
  const bar = originParts(node, shown, currentLocale())
  return bar ? h('div', { 'class': 'pm-code-origin', 'data-anchor': bar.anchor }, bar.parts.map(originPart)) : null
}

function output(run: RunResult & { cacheKey?: string }, i: number): VNode {
  const notes = outputNotes(run, currentLocale())
  return h('div', { 'key': run.cacheKey || i, 'class': ['pm-output', { 'pm-output--failed': !run.ok }], 'data-executor': run.executorId }, [
    run.stdout ? h('pre', { class: 'pm-output__stdout' }, run.stdout) : null,
    run.stderr ? h('pre', { class: 'pm-output__stderr' }, run.stderr) : null,
    notes.length ? h('p', { class: 'pm-output__note' }, notes.join(' · ')) : null,
  ])
}

/**
 * An IR `code` node: the listing (or the variant of the current step), the
 * lines highlighted at the current step, where the code comes from, and its
 * recorded output. Expanded, it shows every variant and no step highlight.
 * Code whose `run.when` includes `live` runs in the browser with the
 * `executor` service (its `run.executor` when registered); the output of the
 * last run, or the error of a run that failed to start, replaces the recorded
 * one. A run of code that has changed since it started (a live update), or
 * that a later run overtook, is stopped and its output dropped. The run
 * controls depend on the browser's services, so they render disabled until
 * the block is mounted: the server render and the hydration agree.
 */
export const CodeBlockView = defineComponent({
  name: 'PmCodeBlock',
  props: {
    block: { type: Object as PropType<IRBlock>, required: true },
    step: { type: Number, required: true },
    expanded: Boolean,
  },
  setup(props) {
    // Inside a component (e.g. a run panel) the component runs the code and shows its output.
    const owned = inject(IN_COMPONENT, false)
    const executor = useService(EXECUTOR)
    const report = useStartReport()
    const live = shallowRef<RunResult>()
    const running = ref(false)
    const mounted = ref(false)
    /** The run under way: stopped when the code changes, the block goes away or another run starts. */
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
    const run = async () => {
      const node = props.block.node as CodeNode
      const router = executor.value
      if (!node.run || !router || running.value) return
      stop()
      const controller = new AbortController()
      current = controller
      running.value = true
      const { lang, args, stdin, timeoutMs, executor: preferred } = node.run
      // The preferred executor when it is registered and supports the language; the router picks otherwise.
      const target = router.list().find(e => e.id === preferred && e.supports(lang)) ?? router
      const started = Date.now()
      let result: RunResult
      try {
        result = await target.run({ lang, code: node.value, args, stdin, timeoutMs }, controller.signal)
      } catch (error) {
        // A runtime that fails to load or crashes shows as a failed run, not as nothing.
        result = failedRun(target.id, messages().code.executorFailed(target.id, errorMessage(error)), Date.now() - started)
      }
      if (controller.signal.aborted) return
      live.value = result
      current = undefined
      running.value = false
    }
    // A changed listing makes the output of its last run obsolete, and stops a run under way.
    watch(() => (props.block.node as CodeNode).value, () => {
      stop()
      live.value = undefined
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
      const runnable = !owned && node.run && node.run.when !== 'compile'
      const t = messages().code
      const available = mounted.value && executor.value
      const controls = runnable
        ? h('div', { class: 'pm-code-block__run' }, [
            h('button', { type: 'button', disabled: running.value || !available, onClick: run }, running.value ? t.running : live.value ? t.rerun : t.run),
            mounted.value && !executor.value && report.value ? h('span', { class: 'pm-code-block__hint' }, t.unavailable) : null,
          ])
        : null
      const runs = owned ? [] : live.value ? [live.value] : node.outputs ?? []
      const outputs = runs.length ? h('div', { 'class': 'pm-outputs', 'data-source': live.value ? 'live' : 'recorded' }, runs.map(output)) : null
      return h('div', { 'class': 'pm-code-block', 'data-state': props.expanded ? undefined : state, 'data-run': runnable ? node.run!.when : undefined }, [
        originBar(node, shown),
        ...listings,
        controls,
        outputs,
      ])
    }
  },
})
