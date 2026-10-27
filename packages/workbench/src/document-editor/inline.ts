import { isDocumentTextLink } from '@lincyaw/kernel'
import type { InlineContent, StyledText, Styles } from '@blocknote/core'
import type { InlineNode, TextAlignment, TextMark, TextStyle } from '@lincyaw/kernel'
import type { documentEditorSchema } from './schema.tsx'

type NativeStyles = Styles<typeof documentEditorSchema.styleSchema>
export type NativeInline = InlineContent<typeof documentEditorSchema.inlineContentSchema, typeof documentEditorSchema.styleSchema>
type NativeText = StyledText<typeof documentEditorSchema.styleSchema>

export interface InlineProjectionContext {
  opaqueInline: Map<string, InlineNode>
  newInlineId(): string
}

export interface NativeTextProperties {
  textAlignment: TextAlignment
  textColor: string
  backgroundColor: string
}

const BOOLEAN_MARKS = ['bold', 'italic', 'underline', 'strike', 'code'] as const

function nativeStyles(marks: readonly TextMark[] | undefined): NativeStyles {
  const styles: NativeStyles = {}
  for (const mark of marks ?? []) {
    if (mark.type === 'color') styles.textColor = mark.value
    else if (mark.type === 'background') styles.backgroundColor = mark.value
    else styles[mark.type] = true
  }
  return styles
}

function productMarks(styles: NativeStyles): TextMark[] | undefined {
  const marks: TextMark[] = []
  for (const type of BOOLEAN_MARKS) if (styles[type]) marks.push({ type })
  if (styles.textColor !== undefined) marks.push({ type: 'color', value: styles.textColor })
  if (styles.backgroundColor !== undefined) marks.push({ type: 'background', value: styles.backgroundColor })
  return marks.length ? marks : undefined
}

function label(node: InlineNode): string {
  if (node.type === 'text') return node.text
  if (node.type === 'math') return node.value
  if (node.type === 'break') return '\n'
  if (node.type === 'extension') return node.fallback
  return node.children.map(label).join('') || node.href
}

function opaque(node: InlineNode, context: InlineProjectionContext): NativeInline {
  const entityId = context.newInlineId()
  context.opaqueInline.set(entityId, structuredClone(node))
  return { type: 'presmiumInline', props: { entityId, kind: node.type, label: label(node) }, content: undefined }
}

function nativeText(node: Extract<InlineNode, { type: 'text' | 'break' }>): NativeText {
  return { type: 'text', text: node.type === 'break' ? '\n' : node.text, styles: node.type === 'text' ? nativeStyles(node.marks) : {} }
}

/** Use native links only when their children fit BlockNote's public styled-text link content. */
export function productInlineToNative(nodes: readonly InlineNode[], context: InlineProjectionContext): NativeInline[] {
  return nodes.map(node => {
    if (node.type === 'text' || node.type === 'break') return nativeText(node)
    if (isDocumentTextLink(node)) {
      return { type: 'link', href: node.href, content: node.children.map(child => nativeText(child as Extract<InlineNode, { type: 'text' | 'break' }>)) }
    }
    return opaque(node, context)
  })
}

function productText(node: NativeText): InlineNode[] {
  const marks = productMarks(node.styles)
  const parts = node.text.split('\n')
  const content: InlineNode[] = []
  parts.forEach((text, index) => {
    if (index) content.push({ type: 'break' })
    if (text) content.push({ type: 'text', text, ...marks ? { marks } : {} })
  })
  return content
}

/** Unknown atoms are resolved from the projection registry, never flattened to their visible labels. */
export function nativeInlineToProduct(nodes: readonly NativeInline[], context: InlineProjectionContext): InlineNode[] {
  return nodes.flatMap(node => {
    if (node.type === 'text') return productText(node)
    if (node.type === 'link') return [{ type: 'link', href: node.href, children: node.content.flatMap(productText) } satisfies InlineNode]
    if (node.props.kind === 'math') return [{ type: 'math', value: node.props.label } satisfies InlineNode]
    const original = context.opaqueInline.get(node.props.entityId)
    if (!original) throw new Error('document-inline-reference')
    return [structuredClone(original)]
  })
}

export function productTextStyleToNative(style?: TextStyle): NativeTextProperties {
  return { textAlignment: style?.alignment ?? 'left', textColor: style?.color ?? 'default', backgroundColor: style?.background ?? 'default' }
}

export function nativeTextStyleToProduct(props: Partial<NativeTextProperties>): TextStyle | undefined {
  const style: TextStyle = {}
  if (props.textAlignment && props.textAlignment !== 'left') style.alignment = props.textAlignment
  if (props.textColor && props.textColor !== 'default') style.color = props.textColor
  if (props.backgroundColor && props.backgroundColor !== 'default') style.background = props.backgroundColor
  return Object.keys(style).length ? style : undefined
}
