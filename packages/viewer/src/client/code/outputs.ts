import { currentLocale } from '@lincyaw/host'
import { htmlAsText, isProseRun } from '@lincyaw/kernel'
import type { MdastNode, RunOutput, RunResult } from '@lincyaw/kernel'
import { AnsiUp } from 'ansi_up'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import type { ReactElement, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { h } from '../element.ts'
import { outputNotes } from '../../domain/index.ts'
import { markdownToHast } from '../markdown/handlers.ts'
import { PmMath } from '../markdown/math.ts'
import { hastToVNodes } from '../markdown/render.ts'
import { findNodeRenderer } from '../registry.ts'

const ORDER = ['text/html', 'text/markdown', 'text/latex', 'image/svg+xml', 'image/png', 'image/jpeg', 'image/gif', 'application/json', 'text/plain']

function text(value: unknown): string {
  return Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function ansi(value: string): string {
  return new AnsiUp().ansi_to_html(value)
}

function markdownOutput(markdown: string, prefix: string): ReactNode[] {
  const mdast = htmlAsText(fromMarkdown(markdown, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as unknown as MdastNode)
  return hastToVNodes(markdownToHast(mdast, prefix).children, {})
}

let purify: Promise<(html: string) => string> | undefined

function HtmlOutput({ html, plain = '' }: { html: string, plain?: string }) {
  const [clean, setClean] = useState<string>()
  useEffect(() => { let active = true; purify ??= import('dompurify').then(m => (html: string) => m.default.sanitize(html)); void purify.then(sanitize => { if (active) setClean(sanitize(html)) }); return () => { active = false } }, [html])
  return clean === undefined ? h('pre', { className: 'pm-output__text' }, plain) : h('div', { className: 'pm-output__html', innerHTML: clean })
}

function display(data: Record<string, unknown>, metadata: Record<string, unknown>, prefix: string, key: number): ReactNode {
  for (const type of Object.keys(data)) {
    const renderer = findNodeRenderer(`mime:${type}`)
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

function richOutput(output: RunOutput, prefix: string, key: number): ReactNode {
  switch (output.output_type) {
    case 'stream': return h('pre', { key, class: `pm-output__${output.name}`, innerHTML: ansi(text(output.text)) })
    case 'error': return h('pre', { key, class: 'pm-output__error', innerHTML: ansi(text(output.traceback.join('\n')) || `${output.ename}: ${output.evalue}`) })
    default: return display(output.data, output.metadata ?? {}, prefix, key)
  }
}

/** Whether a run only displays Markdown that no plugin renders itself, which shows as prose. */
export function isProseOutput(run: RunResult): boolean {
  return isProseRun(run, type => Boolean(findNodeRenderer(`mime:${type}`)))
}

export function runOutput(run: RunResult & { cacheKey?: string }, key: string | number, prefix: string, options: { prose?: boolean, note?: string } = {}): ReactElement {
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
