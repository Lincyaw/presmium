import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { blockNoteDictionary } from './blocknote-messages.ts'
import { BlockNoteView } from '@blocknote/mantine'
import { SideMenuExtension } from '@blocknote/core/extensions'
import { DragHandleMenu, RemoveBlockItem, SideMenu, SideMenuController, useBlockNoteEditor, useComponentsContext, useCreateBlockNote, useDictionary, useExtension, useExtensionState, usePortalElement } from '@blocknote/react'
import type { SideMenuProps } from '@blocknote/react'
import { PmButton, PmDialog, PmIcon, PmInput } from '../components.tsx'
import type { Locale } from '../messages.ts'
import { DOCUMENT_EDITOR_THEME } from './BlockNoteSurface.tsx'
import { NARRATION_CONTEXT, NARRATION_MESSAGES, createNarrationExtensions, narrationSchema } from './narration-schema.tsx'
import type { NativeNarrationBlock, NativeNarrationEditor, NativeNarrationInput } from './narration-schema.tsx'

export interface NarrationEditorProps<T> {
  identity: string
  fieldId: string
  content: T
  getContent?(): T | undefined
  toNative(content: T): NativeNarrationInput[]
  fromNative(blocks: readonly NativeNarrationBlock[]): T
  blockMenu?: boolean
  cueOwners?(): ReadonlyMap<string, string>
  onCueCopy?(from: string, to: string): void
  locale: Locale
  reset?: number
  readOnly?: boolean
  advanced?: boolean
  onChange(content: T): void
  onComposition?(composing: boolean): void
  onFocus?(): void
  onError?(error: Error): void
  onReady?(editor: NativeNarrationEditor | undefined): void
}

/** A native field can live inside an opaque body node without sharing its DOM event root. */
export function NarrationEditor<T>(props: NarrationEditorProps<T>) {
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
  return <div ref={mount} contentEditable={false} data-narration-editor={props.fieldId} />
}

function NarrationBlockMenu() {
  const components = useComponentsContext()!, dictionary = useDictionary(), portalElement = usePortalElement()
  const sideMenu = useExtension(SideMenuExtension)
  return <components.Generic.Menu.Root position="left" portalElement={portalElement} onOpenChange={open => {
    if (open) sideMenu.freezeMenu()
    else sideMenu.unfreezeMenu()
  }}>
    <components.Generic.Menu.Trigger><components.SideMenu.Button label={dictionary.side_menu.drag_handle_label} icon={<PmIcon name="more" />} /></components.Generic.Menu.Trigger>
    <DragHandleMenu><RemoveBlockItem>{dictionary.drag_handle.delete_menuitem}</RemoveBlockItem></DragHandleMenu>
  </components.Generic.Menu.Root>
}

function InsertNarrationBlock() {
  const editor = useBlockNoteEditor(), components = useComponentsContext()!, dictionary = useDictionary()
  const block = useExtensionState(SideMenuExtension, { selector: state => state?.block })
  if (!block) return null
  return <components.SideMenu.Button label={dictionary.side_menu.add_block_label} icon={<PmIcon name="plus" />} onClick={() => {
    const [inserted] = editor.insertBlocks([{ type: 'paragraph' }], block, 'after')
    editor.setTextCursorPosition(inserted!, 'start'); editor.focus()
  }} />
}

function NarrationSideMenu(props: SideMenuProps) {
  return <SideMenu {...props}><InsertNarrationBlock /><NarrationBlockMenu /></SideMenu>
}

function NarrationSurface<T>(props: NarrationEditorProps<T>) {
  const current = useRef(props), pending = useRef<string[]>([])
  current.current = props
  const canonical = props.getContent?.() ?? props.content
  const incoming = JSON.stringify(canonical), sourceKey = JSON.stringify([props.identity, props.fieldId, props.reset])
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
  const editor = useCreateBlockNote({ schema: narrationSchema, initialContent: props.toNative(instance.content),
    trailingBlock: false,
    dictionary: { ...blockNoteDictionary(props.locale), placeholders: { ...blockNoteDictionary(props.locale).placeholders, default: props.advanced === false ? t.emptyCaptions : t.empty } },
    extensions: createNarrationExtensions(() => current.current.cueOwners?.() ?? new Map(), (from, to) => current.current.onCueCopy?.(from, to)),
    domAttributes: { editor: { 'aria-label': props.advanced === false ? t.captions : t.field } },
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
      const content = JSON.stringify(editor.document) === baseline ? structuredClone(instance.content) : current.current.fromNative(editor.document)
      const serialized = JSON.stringify(content)
      if (serialized === instance.emitted) return
      instance.emitted = serialized; pending.current.push(serialized)
      current.current.onChange(content)
    } catch (error) { current.current.onError?.(error instanceof Error ? error : new Error(String(error))) }
  }
  return <NARRATION_CONTEXT.Provider value={{ locale: props.locale, readOnly: props.readOnly, advanced: props.advanced }}>
    <div className="pm-ui-narration-editor pm-ui-block-editor pm-ui" data-block-menu={props.blockMenu || undefined} onFocus={() => current.current.onFocus?.()}
      onCompositionStart={() => current.current.onComposition?.(true)}
      onCompositionEnd={() => queueMicrotask(() => { if (active.current === instance) current.current.onComposition?.(false) })}>
      <BlockNoteView editor={editor} editable={!props.readOnly} theme={DOCUMENT_EDITOR_THEME} formattingToolbar={false} sideMenu={false} slashMenu={false} linkToolbar={false} comments={false} onChange={change}>
        {props.blockMenu && <SideMenuController sideMenu={NarrationSideMenu} />}
      </BlockNoteView>
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
