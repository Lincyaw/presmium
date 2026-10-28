import { createExtension, defaultStyleSpecs } from '@blocknote/core'
import { documentColorValue } from '@lincyaw/kernel'
import type { DocumentColorKind } from '@lincyaw/kernel'
import type { StyleSpec } from '@blocknote/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node } from '@tiptap/pm/model'

// Document colours are design tokens; older BlockNote palette names paint as the same semantic token the viewer uses.
export function documentColor(value: string | undefined, kind: DocumentColorKind): string | undefined {
  if (!value || value === 'default') return undefined
  const color = documentColorValue(value, kind)
  return typeof CSS !== 'undefined' && CSS.supports('color', color) ? color : undefined
}

function colorStyle<Config extends { type: 'textColor' | 'backgroundColor', propSchema: 'string' }>(spec: StyleSpec<Config>, property: 'color' | 'backgroundColor'): StyleSpec<Config> {
  const mark = spec.implementation.mark.extend({
    addMarkView() {
      // BlockNote's own style marks always define a mark view.
      const parent = this.parent!()
      return props => {
        const view = parent(props)
        const color = documentColor(props.mark.attrs.stringValue as string | undefined, property === 'color' ? 'text' : 'background')
        if (color && view.dom instanceof HTMLElement) view.dom.style[property] = color
        return view
      }
    },
  })
  return { ...spec, implementation: { ...spec.implementation, mark } }
}

export const documentColorStyles = {
  textColor: colorStyle(defaultStyleSpecs.textColor, 'color'),
  backgroundColor: colorStyle(defaultStyleSpecs.backgroundColor, 'backgroundColor'),
}

function decorations(doc: Node): DecorationSet {
  const found: Decoration[] = []
  doc.descendants((node, position) => {
    const color = documentColor(node.attrs.textColor as string | undefined, 'text'), background = documentColor(node.attrs.backgroundColor as string | undefined, 'background')
    if (color || background) found.push(Decoration.node(position, position + node.nodeSize, { style: [color && `color: ${color}`, background && `background-color: ${background}`].filter(Boolean).join('; ') }))
  })
  return DecorationSet.create(doc, found)
}

/** Block and table-cell colours are painted with public node decorations. */
export const documentBlockColors = createExtension({
  key: 'presmiumDocumentBlockColors',
  prosemirrorPlugins: [new Plugin<DecorationSet>({
    state: {
      init: (_, state: EditorState) => decorations(state.doc),
      apply: (transaction, value) => transaction.docChanged ? decorations(transaction.doc) : value,
    },
    props: { decorations(state) { return this.getState(state) } },
  })],
})
