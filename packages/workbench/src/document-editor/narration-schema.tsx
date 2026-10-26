import { createContext, useContext, useState } from 'react'
import { BlockNoteSchema, createExtension, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core'
import type { Block, BlockNoteEditor, InlineContent, PartialBlock } from '@blocknote/core'
import { createReactInlineContentSpec } from '@blocknote/react'
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Fragment, Slice } from '@tiptap/pm/model'
import type { Node } from '@tiptap/pm/model'
import { PmButton, PmDialog, PmInput } from '../components.tsx'
import type { Locale } from '../messages.ts'

export const NARRATION_MESSAGES = {
  'zh-CN': { field: '讲稿', pronunciation: '发音', display: '显示文字', spoken: '实际读音', done: '确定', cancel: '取消', cue: '提示', empty: '输入本步讲稿…' },
  en: { field: 'Narration', pronunciation: 'Pronunciation', display: 'Written text', spoken: 'Spoken text', done: 'Apply', cancel: 'Cancel', cue: 'Cue', empty: 'Write this step’s narration…' },
}
export const NARRATION_CONTEXT = createContext<{ locale: Locale, readOnly?: boolean }>({ locale: 'zh-CN' })

const atom = createReactInlineContentSpec({
  type: 'narrationAtom',
  propSchema: { kind: { default: 'cue' }, cueId: { default: '' }, payload: { default: '' }, display: { default: '' }, spoken: { default: '' } },
  content: 'none',
}, {
  render: ({ inlineContent, updateInlineContent }) => {
    const { locale, readOnly } = useContext(NARRATION_CONTEXT), t = NARRATION_MESSAGES[locale]
    const [open, setOpen] = useState(false), [display, setDisplay] = useState(''), [spoken, setSpoken] = useState('')
    const props = inlineContent.props
    if (props.kind === 'cue') {
      let action = ''
      try { action = String(JSON.parse(props.payload).action ?? '') } catch { /* The adapter reports malformed content. */ }
      return <span contentEditable={false} className="pm-ui-narration-editor__cue" title={props.cueId}>{t.cue}{action ? ` · ${action}` : ''}</span>
    }
    return <span contentEditable={false}>
      <PmButton small variant="ghost" disabled={readOnly} title={props.spoken} onClick={() => { setDisplay(props.display); setSpoken(props.spoken); setOpen(true) }}>{props.display || t.pronunciation}</PmButton>
      <PmDialog open={open} label={t.pronunciation} closeLabel={t.cancel} onClose={() => setOpen(false)} actions={<>
        <PmButton small onClick={() => setOpen(false)}>{t.cancel}</PmButton>
        <PmButton small variant="primary" onClick={() => { updateInlineContent({ type: 'narrationAtom', props: { ...props, display, spoken } }); setOpen(false) }}>{t.done}</PmButton>
      </>}>
        <PmInput label={t.display} value={display} onChange={event => setDisplay(event.target.value)} />
        <PmInput label={t.spoken} value={spoken} onChange={event => setSpoken(event.target.value)} />
      </PmDialog>
    </span>
  },
})

const cueIdentities = createExtension({
  key: 'presmium-narration-cue-identities',
  tiptapExtensions: [Extension.create({ name: 'presmiumNarrationCueIdentities', addProseMirrorPlugins: () => [new Plugin({
    props: { transformPasted: slice => {
      const copied = (fragment: Fragment): Fragment => {
        const nodes: Node[] = []
        fragment.forEach(node => nodes.push(node.type.name === 'narrationAtom' && node.attrs.kind === 'cue'
          ? node.type.create({ ...node.attrs, cueId: crypto.randomUUID() }, node.content, node.marks)
          : node.isLeaf ? node : node.copy(copied(node.content))))
        return Fragment.fromArray(nodes)
      }
      return new Slice(copied(slice.content), slice.openStart, slice.openEnd)
    } },
    appendTransaction: (_transactions, _old, state) => {
      const seen = new Set<string>(), transaction = state.tr
      state.doc.descendants((node, position) => {
        if (node.type.name !== 'narrationAtom' || node.attrs.kind !== 'cue') return
        const id = node.attrs.cueId as string
        if (!id || seen.has(id)) transaction.setNodeMarkup(position, undefined, { ...node.attrs, cueId: crypto.randomUUID() })
        else seen.add(id)
      })
      return transaction.docChanged ? transaction : null
    },
  })] })],
})
export const narrationSchema = BlockNoteSchema.create({
  blockSpecs: { paragraph: defaultBlockSpecs.paragraph },
  inlineContentSpecs: { ...defaultInlineContentSpecs, narrationAtom: atom }, styleSpecs: {},
})
export const narrationExtensions = [cueIdentities]
export type NativeNarrationEditor = BlockNoteEditor<typeof narrationSchema.blockSchema, typeof narrationSchema.inlineContentSchema, typeof narrationSchema.styleSchema>
export type NativeNarrationBlock = Block<typeof narrationSchema.blockSchema, typeof narrationSchema.inlineContentSchema, typeof narrationSchema.styleSchema>
export type NativeNarrationInput = PartialBlock<typeof narrationSchema.blockSchema, typeof narrationSchema.inlineContentSchema, typeof narrationSchema.styleSchema>
export type NativeNarrationInline = InlineContent<typeof narrationSchema.inlineContentSchema, typeof narrationSchema.styleSchema>
