import { useService, useStartReport } from '@presmium/host'
import { EXECUTOR } from '@presmium/kernel'
import type { CodeNode, CodeOrigin, CodeVariant, IRBlock, RunResult } from '@presmium/kernel'
import type { PropType, VNode, VNodeChild } from 'vue'
import { computed, defineComponent, h, onMounted, ref, shallowRef, watch } from 'vue'
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

/**
 * What the code reference plugin records besides the IR's own fields: whether
 * pinned code drifted from the working tree, and a permalink per version.
 */
type Origin = CodeOrigin
type Variant = CodeVariant

const STATUS: Record<string, string> = { moved: '已移动', fuzzy: '待确认', lost: '已失效' }

function link(className: string, href: string | undefined, text: string, attrs: Record<string, unknown> = {}): VNode {
  return href
    ? h('a', { ...attrs, class: className, href, target: '_blank', rel: 'noopener' }, text)
    : h('span', { ...attrs, class: className }, text)
}

/**
 * Where the code comes from (`CodeNode.origin`): file and lines linked to the
 * repository, the pinned commit or the commit of each version (the shown one
 * marked), and whether the pinned code drifted or the anchor moved. The slides
 * renderer writes the same bar.
 */
function originBar(node: CodeNode, shown: number | undefined): VNodeChild {
  const origin = node.origin as Origin | undefined
  if (!origin) return node.title ? h('div', { class: 'pm-code-origin' }, [h('span', { class: 'pm-code-origin__file' }, node.title)]) : null
  const lines = origin.endLine > origin.startLine ? `${origin.startLine}-${origin.endLine}` : `${origin.startLine}`
  const variants = (node.variants ?? []) as Variant[]
  const commits = variants.length
    ? variants.map((variant, k) => link('pm-code-origin__variant', variant.permalink, variant.label, { 'key': variant.label, 'data-active': k === shown ? '' : undefined }))
    : [h('span', { class: 'pm-code-origin__commit', title: origin.pin }, origin.pin ? `@ ${origin.pin.slice(0, 7)}` : '工作区')]
  const badge = STATUS[origin.status]
    ? h('span', { 'class': 'pm-code-origin__badge', 'data-status': origin.status }, STATUS[origin.status])
    : origin.pin && !variants.length && origin.drift
      ? h('span', {
          'class': 'pm-code-origin__badge',
          'data-drift': origin.drift,
          'title': origin.drift === 'drifted' ? '工作区中的代码已改变，运行 presmium check 查看差异' : '锁定的代码与工作区一致',
        }, origin.drift === 'drifted' ? '已漂移' : '已锁定')
      : null
  return h('div', { 'class': 'pm-code-origin', 'data-anchor': origin.anchor }, [
    link('pm-code-origin__file', origin.permalink, `${node.title ?? origin.file}:${lines}`, { title: origin.permalink ? `在仓库中打开 ${origin.file}` : origin.anchor }),
    ...commits,
    badge,
  ])
}

function output(run: RunResult & { cacheKey?: string }, i: number): VNode {
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
 * Code whose `run.when` includes `live` runs in the browser with the
 * `executor` service (its `run.executor` when registered); the output of the
 * last run, or the error of a run that failed to start, replaces the recorded one.
 */
export const CodeBlockView = defineComponent({
  name: 'PmCodeBlock',
  props: {
    block: { type: Object as PropType<IRBlock>, required: true },
    step: { type: Number, required: true },
    expanded: Boolean,
  },
  setup(props) {
    const executor = useService(EXECUTOR)
    const report = useStartReport()
    const live = shallowRef<RunResult>()
    const running = ref(false)
    const run = async () => {
      const node = props.block.node as CodeNode
      const router = executor.value
      if (!node.run || !router || running.value) return
      running.value = true
      const { lang, args, stdin, timeoutMs, executor: preferred } = node.run
      // The preferred executor when it is registered and supports the language; the router picks otherwise.
      const target = router.list().find(e => e.id === preferred && e.supports(lang)) ?? router
      const started = Date.now()
      try {
        live.value = await target.run({ lang, code: node.value, args, stdin, timeoutMs })
      } catch (error) {
        // A runtime that fails to load or crashes shows as a failed run, not as nothing.
        const stderr = `执行器 ${target.id} 出错：${error instanceof Error ? error.message : String(error)}`
        live.value = { ok: false, stdout: '', stderr, exitCode: null, durationMs: Date.now() - started, timedOut: false, source: 'live', executorId: target.id }
      } finally {
        running.value = false
      }
    }
    // A changed listing makes the output of its last run obsolete.
    watch(() => (props.block.node as CodeNode).value, () => {
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
          : [h(CodeView, { key: 'variant', lang: node.lang, value: variants[shown]!.value })]
      const runnable = node.run && node.run.when !== 'compile'
      const controls = runnable
        ? h('div', { class: 'pm-code-block__run' }, [
            h('button', { type: 'button', disabled: running.value || !executor.value, onClick: run }, running.value ? '运行中…' : live.value ? '重跑' : '运行'),
            !executor.value && report.value ? h('span', { class: 'pm-code-block__hint' }, '执行服务不可用') : null,
          ])
        : null
      const runs = live.value ? [live.value] : node.outputs ?? []
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
