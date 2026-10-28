import type { DocumentBlock, JsonValue, TeachingDocument } from '@lincyaw/kernel'
import type { Locale } from '../messages.ts'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'
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

/** A readable source fallback while the independent component snapshot is unavailable. */
export function DocumentBlockFallback({ block, document, locale }: { block: DocumentBlock, document: TeachingDocument, locale: Locale }) {
  const t = DOCUMENT_EDITOR_MESSAGES[locale]
  if (isDiagram(block, document)) return <PmNotice>{t.diagram(block.type === 'code' && block.title || '')}</PmNotice>
  if (block.type === 'code') return <PmNotice>{t.codeReference(block.title ?? block.origin?.anchor ?? block.language)}</PmNotice>
  if (block.type !== 'component') return null
  const definition = document.definitions[block.definitionId]
  const implementation = definition?.implementation
  const name = typeof block.parameters.title === 'string' ? block.parameters.title : typeof block.parameters.scene === 'string' ? block.parameters.scene
    : typeof definition?.data?.title === 'string' ? definition.data.title : typeof definition?.data?.name === 'string' && definition.kind !== 'scene' ? definition.data.name
      : implementation?.type === 'file' ? implementation.path.split('/').at(-1)!.replace(/\.[^.]+$/, '') : implementation?.type === 'module' ? implementation.exportName ?? implementation.specifier : implementation?.type === 'plugin' ? implementation.name : block.definitionId
  const description = typeof block.parameters.alt === 'string' ? block.parameters.alt : fallbackText(definition?.data?.fallback)
  return <PmNotice><div className="pm-document-editor__fallback"><strong>{definition?.kind === 'scene' ? t.animation(name) : t.component(name)}</strong>{description ? <p>{description}</p> : null}</div></PmNotice>
}
