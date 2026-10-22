import type { RunOutput } from '@lincyaw/kernel'
import DOMPurify from 'dompurify'
import { mimeText } from '../domain/index.ts'

export type DisplayItem =
  | { kind: 'stream', name: 'stdout' | 'stderr', text: string }
  | { kind: 'error', text: string }
  | { kind: 'image', src: string }
  | { kind: 'dropped-image' }
  | { kind: 'html', html: string }
  | { kind: 'text', text: string }

const IMAGES = ['image/png', 'image/jpeg', 'image/gif']
const BASE64 = /^[A-Za-z0-9+/=]*$/

/** What to show of one output: an image, sanitized HTML (only where `html` allows it) or text, in this order of preference. */
export function displayItem(output: RunOutput, options: { html: boolean }): DisplayItem {
  if (output.output_type === 'stream') return { kind: 'stream', name: output.name, text: mimeText(output.text) }
  if (output.output_type === 'error') return { kind: 'error', text: output.traceback.join('\n') || `${output.ename}: ${output.evalue}` }
  const { data } = output
  const image = IMAGES.find(type => data[type] !== undefined)
  if (image) {
    const base64 = mimeText(data[image], 2).replace(/\s/g, '')
    return BASE64.test(base64) ? { kind: 'image', src: `data:${image};base64,${base64}` } : { kind: 'dropped-image' }
  }
  if (data['image/svg+xml'] !== undefined) return { kind: 'image', src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mimeText(data['image/svg+xml'], 2))}` }
  if (data['text/html'] !== undefined && options.html) return { kind: 'html', html: DOMPurify.sanitize(mimeText(data['text/html'], 2)) }
  return { kind: 'text', text: mimeText(data['text/markdown'] ?? data['text/plain'] ?? data['application/json'] ?? data['text/latex'], 2) }
}
