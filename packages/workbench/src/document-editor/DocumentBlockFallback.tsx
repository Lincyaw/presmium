import type { DocumentBlock, JsonValue, TeachingDocument } from '@lincyaw/kernel'
import type { Locale } from '../messages.ts'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'
import { BLOCK_PREVIEW_MESSAGES } from './block-preview-messages.ts'
import { PmNotice } from '../components.tsx'
import { isDiagram } from './projection.ts'

export function fallbackText(value: unknown): string {
  if (!value || typeof value !== 'object') return ''
  if (Array.isArray(value)) return value.map(fallbackText).filter(Boolean).join('\n')
  const node = value as { type?: string, value?: string, text?: string, alt?: string, children?: JsonValue[], fallback?: unknown }
  if (node.type === 'text') return node.text ?? node.value ?? ''
  if (node.type === 'image') return node.alt ?? ''
  if (node.type === 'math' || node.type === 'code') return node.value ?? ''
  if (node.type === 'extension') return typeof node.fallback === 'string' ? node.fallback : fallbackText(node.fallback)
  return (node.children ?? []).map(fallbackText).join(node.type === 'root' ? '\n' : '')
}

const MEDIA_KINDS = ['video', 'audio', 'animation', 'image'] as const
const authorText = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

/**
 * A readable source fallback while the independent component snapshot is unavailable. It names the content only by what
 * the author wrote (a title) or by its kind, never by its code (the component, file or definition names).
 */
export function DocumentBlockFallback({ block, document, locale }: { block: DocumentBlock, document: TeachingDocument, locale: Locale }) {
  const t = DOCUMENT_EDITOR_MESSAGES[locale], p = BLOCK_PREVIEW_MESSAGES[locale]
  if (isDiagram(block, document)) return <PmNotice>{t.diagram(block.type === 'code' && block.title || '')}</PmNotice>
  if (block.type === 'code') return <PmNotice>{t.codeReference(block.title ?? block.origin?.anchor ?? block.language)}</PmNotice>
  if (block.type !== 'component') return null
  const definition = document.definitions[block.definitionId]
  const schema = definition?.parameterSchema as { title?: unknown } | undefined
  const name = authorText(block.parameters.title) ?? authorText(definition?.data?.title) ?? authorText(schema?.title)
  const media = MEDIA_KINDS.find(kind => kind === block.parameters.kind)
  const kind = definition?.kind === 'scene' ? p.animation : media ? p[media]
    : definition?.implementation.type === 'plugin' && definition.implementation.name === 'PmMarkmap' ? p.mindMap : p.content
  const label = name ? definition?.kind === 'scene' ? t.animation(name) : t.component(name) : kind
  const description = typeof block.parameters.alt === 'string' ? block.parameters.alt : fallbackText(definition?.data?.fallback)
  return <PmNotice><div className="pm-document-editor__fallback"><strong>{label}</strong>{description ? <p>{description}</p> : null}</div></PmNotice>
}
