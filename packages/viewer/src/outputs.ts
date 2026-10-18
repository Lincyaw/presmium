import { currentLocale } from '@presmium/host'
import type { MdastNode, RunOutput, RunResult } from '@presmium/kernel'
import { AnsiUp } from 'ansi_up'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import type { VNode, VNodeChild } from 'vue'
import { defineComponent, h, onMounted, ref, watch } from 'vue'
import { outputNotes } from './domain/index.ts'
import { hastToVNodes, markdownToHast } from './markdown.ts'
import { getNodeRenderer } from './registry.ts'
import { PmMath } from './rich.ts'

const ORDER = ['text/html', 'text/markdown', 'text/latex', 'image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'application/json', 'text/plain']

function text(value: unknown): string {
  return Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function ansi(value: string): string {
  return new AnsiUp().ansi_to_html(value)
}

function literalHtml(node: MdastNode): MdastNode {
  if (node.type === 'html') return { type: 'text', value: String(node.value ?? '') }
  return node.children ? { ...node, children: node.children.map(literalHtml) } : node
}

export function markdownOutput(markdown: string, prefix: string): VNodeChild[] {
  const mdast = literalHtml(fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as unknown as MdastNode)
  return hastToVNodes(markdownToHast(mdast, prefix).children, {})
}

let purify: Promise<(html: string) => string> | undefined

const HtmlOutput = defineComponent({
  name: 'PmHtmlOutput',
  props: { html: { type: String, required: true }, plain: { type: String, default: '' } },
  setup(props) {
    const clean = ref<string>()
    const render = async () => {
      purify ??= import('dompurify').then(m => (html: string) => m.default.sanitize(html))
      clean.value = (await purify)(props.html)
    }
    onMounted(render)
    watch(() => props.html, render)
    return () => clean.value === undefined
      ? h('pre', { class: 'pm-output__text' }, props.plain)
      : h('div', { class: 'pm-output__html', innerHTML: clean.value })
  },
})

function display(data: Record<string, unknown>, metadata: Record<string, unknown>, prefix: string, key: number): VNodeChild {
  for (const type of Object.keys(data)) {
    const renderer = getNodeRenderer(`mime:${type}`)
    if (renderer) return h(renderer, { key, type, data: data[type], metadata })
  }
  const type = ORDER.find(t => data[t] !== undefined)
  if (!type) return null
  const value = data[type]
  const attrs = { 'key': key, 'class': 'pm-output__display', 'data-mime': type }
  if (type === 'text/html') return h('div', attrs, [h(HtmlOutput, { html: text(value), plain: text(data['text/plain'] ?? '') })])
  if (type === 'text/markdown') return h('div', { ...attrs, class: ['pm-output__display', 'pm-output__markdown'] }, markdownOutput(text(value), prefix))
  if (type === 'text/latex') return h('div', attrs, [h(PmMath, { tex: text(value).trim().replace(/^\$\$?|\$\$?$/g, ''), display: true })])
  if (type === 'image/svg+xml') return h('div', attrs, [h('img', { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(text(value))}`, alt: '' })])
  if (type.startsWith('image/')) return h('div', attrs, [h('img', { src: `data:${type};base64,${text(value).replace(/\s/g, '')}`, alt: '' })])
  if (type === 'application/json') return h('pre', attrs, JSON.stringify(value, null, 2))
  return h('pre', { ...attrs, innerHTML: ansi(text(value)) })
}

function richOutput(output: RunOutput, prefix: string, key: number): VNodeChild {
  switch (output.output_type) {
    case 'stream': return h('pre', { key, class: `pm-output__${output.name}`, innerHTML: ansi(text(output.text)) })
    case 'error': return h('pre', { key, class: 'pm-output__error', innerHTML: ansi(text(output.traceback.join('\n')) || `${output.ename}: ${output.evalue}`) })
    default: return display(output.data, output.metadata ?? {}, prefix, key)
  }
}

export function proseOnly(run: RunResult): boolean {
  const outputs = run.outputs ?? []
  return outputs.length > 0 && outputs.every(o => (o.output_type === 'display_data' || o.output_type === 'execute_result') && o.data['text/markdown'] !== undefined && !Object.keys(o.data).some(type => getNodeRenderer(`mime:${type}`)))
}

export function runOutput(run: RunResult & { cacheKey?: string }, key: string | number, prefix: string, options: { prose?: boolean, note?: string } = {}): VNode {
  const notes = [...outputNotes(run, currentLocale()), ...options.note ? [options.note] : []]
  const content = run.outputs
    ? run.outputs.map((output, i) => richOutput(output, prefix, i))
    : [
        run.stdout ? h('pre', { class: 'pm-output__stdout' }, run.stdout) : null,
        run.stderr ? h('pre', { class: 'pm-output__stderr' }, run.stderr) : null,
      ]
  if (options.prose) return h('div', { 'key': key, 'class': 'pm-output pm-output--prose', 'data-executor': run.executorId }, content)
  return h('div', { 'key': key, 'class': ['pm-output', { 'pm-output--failed': !run.ok }], 'data-executor': run.executorId }, [
    ...content,
    notes.length ? h('p', { class: 'pm-output__note' }, notes.join(' · ')) : null,
  ])
}
