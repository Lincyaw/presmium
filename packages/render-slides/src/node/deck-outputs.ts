import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { escapeHtml, htmlAsText } from '@lincyaw/kernel'
import type { IRBlock, MdastNode, RunOutput, RunResult } from '@lincyaw/kernel'
import { outputNotes } from '@lincyaw/viewer/domain'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { gfm } from 'micromark-extension-gfm'
import { fence } from './code-fences.ts'
import type { Generation } from './generation.ts'
import { sanitizedHtml } from './html.ts'
import { slideMarkdown } from './mdast-to-slides.ts'

export const INLINE_IMAGE = 16_384
export const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif' }

export const joined = (value: unknown): string => (Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : JSON.stringify(value, null, 2))
// eslint-disable-next-line no-control-regex
const plain = (text: string) => text.replace(/\u001B\[[0-9;]*[A-Za-z]/g, '')

/** The URL of an output's image: inline when small, else a file written under the work directory and published with the deck. */
export function imageUrl(type: string, base64: string, gen: Generation): string {
  if (base64.length <= INLINE_IMAGE) return `data:${type};base64,${base64}`
  const data = Buffer.from(base64, 'base64')
  const hash = createHash('sha256').update(data).digest('hex')
  const name = `${hash.slice(0, 8)}-output.${IMAGE_TYPES[type]}`
  const file = join(gen.ctx.workDir, 'outputs', `${hash}.${IMAGE_TYPES[type]}`)
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, data)
  }
  gen.assets.set(name, { file, name })
  return `${gen.ctx.base}${name}`
}

function markdownOutput(text: string, block: IRBlock, gen: Generation): string {
  return slideMarkdown(htmlAsText(fromMarkdown(text, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }) as unknown as MdastNode), block, gen)
}

function richOutput(output: RunOutput, block: IRBlock, gen: Generation): string {
  if (output.output_type === 'stream') return fence('text', plain(joined(output.text)).replace(/\n$/, ''), '')
  if (output.output_type === 'error') return fence('text', plain(output.traceback.join('\n')) || `${output.ename}: ${output.evalue}`, '')
  const { data } = output
  const image = Object.keys(IMAGE_TYPES).find(type => data[type] !== undefined)
  if (image) return `<img class="pm-output__image" alt="" src="${escapeHtml(imageUrl(image, joined(data[image]).replace(/\s/g, ''), gen))}">`
  if (data['image/svg+xml'] !== undefined) return `<img class="pm-output__image" alt="" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(joined(data['image/svg+xml']))}">`
  if (data['text/markdown'] !== undefined) return markdownOutput(joined(data['text/markdown']), block, gen)
  if (data['text/html'] !== undefined) return `<div class="pm-output__html" v-pre>${sanitizedHtml(joined(data['text/html'])).replace(/\n\s*\n/g, '\n')}</div>`
  if (data['text/latex'] !== undefined) return `$$\n${joined(data['text/latex']).trim().replace(/^\$\$?|\$\$?$/g, '')}\n$$`
  const text = data['text/plain'] ?? data['application/json']
  return text === undefined ? '' : fence('text', plain(joined(text)).replace(/\n$/, ''), '')
}

/** A recorded run as slide Markdown: its outputs and notes, or, as prose, its Markdown alone. */
export function runOutput(run: RunResult, block: IRBlock, gen: Generation, prose = false): string {
  const parts = run.outputs
    ? run.outputs.map(o => richOutput(o, block, gen))
    : [[run.stdout, run.stderr].filter(Boolean).join('\n').replace(/\n$/, '')].filter(Boolean).map(text => fence('text', text, ''))
  if (prose) return parts.filter(Boolean).join('\n\n')
  const notes = outputNotes(run, gen.locale)
  if (parts.every(part => !part) && notes.length === 0) return ''
  if (notes.length) parts.push(`<p class="pm-output__note">${escapeHtml(notes.join(' · '))}</p>`)
  return `<div class="pm-output">\n\n${parts.filter(Boolean).join('\n\n')}\n\n</div>`
}
