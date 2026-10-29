import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { NarrationNode } from '@lincyaw/kernel'
import { blockNoteDictionary } from './blocknote-messages.ts'
import { BlockNoteView } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { PmButton, PmDialog, PmInput } from '../components.tsx'
import type { Locale } from '../messages.ts'
import { DOCUMENT_EDITOR_THEME } from './BlockNoteSurface.tsx'
import { narrationToNative, nativeToNarration } from './narration.ts'
import { NARRATION_CONTEXT, NARRATION_MESSAGES, narrationExtensions, narrationSchema } from './narration-schema.tsx'
import type { NativeNarrationEditor } from './narration-schema.tsx'

export interface NarrationEditorProps {
  identity: string
  narrationId: string
  content: NarrationNode[]
  getContent?(): NarrationNode[] | undefined
  locale: Locale
  reset?: number
  readOnly?: boolean
  advanced?: boolean
  onChange(content: NarrationNode[]): void
  onComposition?(composing: boolean): void
  onFocus?(): void
  onError?(error: Error): void
  onReady?(editor: NativeNarrationEditor | undefined): void
}

/** A native field can live inside an opaque body node without sharing its DOM event root. */
export function NarrationEditor(props: NarrationEditorProps) {
  const mount = useRef<HTMLDivElement>(null), root = useRef<ReturnType<typeof createRoot>>(), current = useRef(props)
  current.current = props
  useEffect(() => {
    const host = mount.current!, shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    // Public stylesheet entries are shared; typography and tokens keep their single source.
    const styles = [...document.head.querySelectorAll('link[rel="stylesheet"], style')].map(node => node.cloneNode(true))
    const element = document.createElement('div')
    shadow.append(...styles, element)
    const field = createRoot(element)
    root.current = field
    const stop = (event: Event) => event.stopPropagation()
    const events = ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'compositionstart', 'compositionupdate', 'compositionend', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'focusin', 'focusout', 'copy', 'cut', 'paste', 'dragstart', 'dragover', 'drop']
    for (const event of events) element.addEventListener(event, stop)
    field.render(<NarrationSurface {...current.current} />)
    return () => {
      root.current = undefined
      for (const event of events) element.removeEventListener(event, stop)
      queueMicrotask(() => { field.unmount(); element.remove(); styles.forEach(node => node.parentNode?.removeChild(node)) })
    }
  }, [])
  useEffect(() => { root.current?.render(<NarrationSurface {...props} />) })
  return <div ref={mount} contentEditable={false} data-narration-editor={props.narrationId} />
}

function NarrationSurface(props: NarrationEditorProps) {
  const current = useRef(props), pending = useRef<string[]>([])
  current.current = props
  const canonical = props.getContent?.() ?? props.content
  const incoming = JSON.stringify(canonical), sourceKey = JSON.stringify([props.identity, props.narrationId, props.reset])
  const version = useRef({ key: sourceKey, incoming, epoch: 0 })
  if (version.current.key !== sourceKey) {
    version.current.epoch++; version.current.key = sourceKey; pending.current = []
  } else if (version.current.incoming !== incoming) {
    const receipt = pending.current.lastIndexOf(incoming)
    if (receipt >= 0) pending.current.splice(0, receipt + 1)
    else { version.current.epoch++; pending.current = [] }
  }
  version.current.incoming = incoming
  const instance = useMemo(() => ({ content: structuredClone(canonical), emitted: incoming }), [sourceKey, version.current.epoch])
  const active = useRef(instance); active.current = instance
  const t = NARRATION_MESSAGES[props.locale]
  const editor = useCreateBlockNote({ schema: narrationSchema, initialContent: narrationToNative(props.narrationId, instance.content),
    trailingBlock: false,
    dictionary: { ...blockNoteDictionary(props.locale), placeholders: { ...blockNoteDictionary(props.locale).placeholders, default: props.advanced === false ? t.emptyCaptions : t.empty } },
    extensions: narrationExtensions, domAttributes: { editor: { 'aria-label': props.advanced === false ? t.captions : t.field } },
  }, [instance, props.advanced])
  const baseline = useMemo(() => JSON.stringify(editor.document), [editor])
  const [open, setOpen] = useState(false), [display, setDisplay] = useState(''), [spoken, setSpoken] = useState('')
  useEffect(() => {
    current.current.onReady?.(editor)
    return () => { props.onComposition?.(false); props.onReady?.(undefined) }
  }, [editor])
  const change = () => {
    if (active.current !== instance) return
    if (current.current.getContent && current.current.getContent() === undefined) return
    try {
      const content = JSON.stringify(editor.document) === baseline ? structuredClone(instance.content) : nativeToNarration(editor.document)
      const serialized = JSON.stringify(content)
      if (serialized === instance.emitted) return
      instance.emitted = serialized; pending.current.push(serialized)
      current.current.onChange(content)
    } catch (error) { current.current.onError?.(error instanceof Error ? error : new Error(String(error))) }
  }
  return <NARRATION_CONTEXT.Provider value={{ locale: props.locale, readOnly: props.readOnly, advanced: props.advanced }}>
    <div className="pm-ui-narration-editor pm-ui-block-editor pm-ui" onFocus={() => current.current.onFocus?.()}
      onCompositionStart={() => current.current.onComposition?.(true)}
      onCompositionEnd={() => queueMicrotask(() => { if (active.current === instance) current.current.onComposition?.(false) })}>
      <BlockNoteView editor={editor} editable={!props.readOnly} theme={DOCUMENT_EDITOR_THEME} formattingToolbar={false} sideMenu={false} slashMenu={false} linkToolbar={false} comments={false} onChange={change} />
      {props.advanced !== false && <div className="pm-ui-narration-editor__actions"><PmButton small variant="ghost" disabled={props.readOnly} onClick={() => { setDisplay(editor.getSelectedText()); setSpoken(''); setOpen(true) }}>{t.pronunciation}</PmButton></div>}
      <PmDialog open={open} label={t.pronunciation} closeLabel={t.cancel} onClose={() => setOpen(false)} actions={<>
        <PmButton small onClick={() => setOpen(false)}>{t.cancel}</PmButton>
        <PmButton small variant="primary" disabled={!display} onClick={() => { editor.insertInlineContent([{ type: 'narrationAtom', props: { kind: 'pronunciation', display, spoken, cueId: '', payload: '' } }], { updateSelection: true }); setOpen(false); editor.focus() }}>{t.done}</PmButton>
      </>}>
        <PmInput label={t.display} value={display} onChange={event => setDisplay(event.target.value)} />
        <PmInput label={t.spoken} value={spoken} onChange={event => setSpoken(event.target.value)} />
      </PmDialog>
    </div>
  </NARRATION_CONTEXT.Provider>
}
