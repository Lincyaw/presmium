import type { CodeNode, IRBlock, RecordedRun } from '@presmium/kernel'
import type { PropType, VNode } from 'vue'
import { computed, defineComponent, h, onMounted, shallowRef, watch } from 'vue'
import { blockState } from './domain/index.ts'
import { highlighterFor, THEMES } from './highlight.ts'

type Loaded = Awaited<ReturnType<typeof highlighterFor>>

/**
 * A code listing with highlighted lines. It renders plain lines first (server
 * render, hydration) and switches to Shiki once the grammar has loaded.
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
    const shiki = shallowRef<Loaded>()
    const load = async () => {
      shiki.value = await highlighterFor(props.lang).catch(() => undefined)
    }
    onMounted(load)
    watch(() => props.lang, load)
    const code = computed(() => props.value.replace(/\n$/, ''))
    const lines = computed(() => new Set(props.highlight ?? []))
    const html = computed(() => {
      if (!shiki.value) return undefined
      const marked = lines.value
      return shiki.value.highlighter.codeToHtml(code.value, {
        lang: shiki.value.lang,
        themes: THEMES,
        defaultColor: false,
        transformers: [{
          line(node, line) {
            if (marked.has(line)) this.addClassToHast(node, 'highlighted')
          },
        }],
      })
    })
    return () => {
      const attrs = { 'class': ['pm-code', { 'pm-code--highlight': lines.value.size > 0 }], 'data-lang': props.lang || undefined }
      if (html.value) return h('div', { ...attrs, key: 'shiki', innerHTML: html.value })
      const rows = code.value.split('\n').flatMap((text, i) => [h('span', { class: ['line', { highlighted: lines.value.has(i + 1) }] }, text), '\n'])
      return h('div', { ...attrs, key: 'plain' }, [h('pre', { class: 'shiki' }, [h('code', rows.slice(0, -1))])])
    }
  },
})

const STATUS: Record<string, string> = { moved: '已移动', fuzzy: '待确认', lost: '已失效' }

function output(run: RecordedRun, i: number): VNode {
  const notes = [
    run.timedOut ? '超时' : '',
    run.exitCode !== null && run.exitCode !== 0 ? `退出码 ${run.exitCode}` : '',
    run.source === 'recorded' ? '预录输出' : '',
  ].filter(Boolean)
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
 */
export const CodeBlockView = defineComponent({
  name: 'PmCodeBlock',
  props: {
    block: { type: Object as PropType<IRBlock>, required: true },
    step: { type: Number, required: true },
    expanded: Boolean,
  },
  setup(props) {
    return () => {
      const node = props.block.node as CodeNode
      const state = blockState(props.block, props.step)
      const { origin } = node
      const title = node.title ?? (origin ? `${origin.file}:${origin.startLine}-${origin.endLine}` : undefined)
      const header = title || origin?.permalink
        ? h('div', { class: 'pm-code-block__header' }, [
            title ? h('span', { class: 'pm-code-block__title' }, title) : null,
            origin && STATUS[origin.status] ? h('span', { 'class': 'pm-code-block__status', 'data-status': origin.status }, STATUS[origin.status]) : null,
            origin?.permalink ? h('a', { class: 'pm-code-block__permalink', href: origin.permalink, target: '_blank', rel: 'noopener' }, '源码') : null,
          ])
        : null
      const variants = node.variants ?? []
      const listings = variants.length === 0
        ? [h(CodeView, { lang: node.lang, value: node.value, highlight: props.expanded ? undefined : node.highlight?.[state] })]
        : props.expanded
          ? variants.map(v => h('div', { key: v.label, class: 'pm-code-block__variant' }, [h('p', { class: 'pm-code-block__label' }, v.label), h(CodeView, { lang: node.lang, value: v.value })]))
          : [h(CodeView, { key: 'variant', lang: node.lang, value: variants[Math.min(state, variants.length - 1)]!.value })]
      const outputs = node.outputs?.length ? h('div', { class: 'pm-outputs' }, node.outputs.map(output)) : null
      return h('div', { 'class': 'pm-code-block', 'data-state': props.expanded ? undefined : state }, [header, ...listings, outputs])
    }
  },
})
