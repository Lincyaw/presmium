import { COLORS_DEFAULT, createExtension, defaultStyleSpecs } from '@blocknote/core'
import type { StyleSpec } from '@blocknote/core'
import { Plugin } from '@tiptap/pm/state'
import type { EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node } from '@tiptap/pm/model'

// BlockNote styles only its own palette names; document colours may be any CSS colour, typically a design token.
function documentColor(value: string | undefined): string | undefined {
  if (!value || value === 'default' || value in COLORS_DEFAULT) return undefined
  return typeof CSS !== 'undefined' && CSS.supports('color', value) ? value : undefined
}

function colorStyle<Config extends { type: 'textColor' | 'backgroundColor', propSchema: 'string' }>(spec: StyleSpec<Config>, property: 'color' | 'backgroundColor'): StyleSpec<Config> {
  const mark = spec.implementation.mark.extend({
    addMarkView() {
      // BlockNote's own style marks always define a mark view.
      const parent = this.parent!()
      return props => {
        const view = parent(props)
        const color = documentColor(props.mark.attrs.stringValue as string | undefined)
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
    const color = documentColor(node.attrs.textColor as string | undefined), background = documentColor(node.attrs.backgroundColor as string | undefined)
    if (color || background) found.push(Decoration.node(position, position + node.nodeSize, { style: [color && `color: ${color}`, background && `background-color: ${background}`].filter(Boolean).join('; ') }))
  })
  return DecorationSet.create(doc, found)
}

/** Block and table-cell colours outside BlockNote's palette are painted with public node decorations. */
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
