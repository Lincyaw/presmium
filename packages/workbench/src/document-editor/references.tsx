import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { SuggestionMenu as SuggestionMenuExtension } from '@blocknote/core/extensions'
import { SuggestionMenuController } from '@blocknote/react'
import type { DefaultReactSuggestionItem, SuggestionMenuProps } from '@blocknote/react'
import type { DocumentBlock, EmbedBlock, InlineNode, PresmiumDocument, ReferenceTarget, RichTextNode } from '@lincyaw/kernel'
import type { DocumentSearchHit, EmbedSource } from '@lincyaw/kernel/contracts'
import { PmButton, PmDialog, PmDocMention, PmDocPreviewCard, PmIcon, PmMentionPicker, PmNotice, PmSearchList, PmSkeleton, PmSyncedBlockFrame } from '../components.tsx'
import type { DocPreview, MentionOption } from '../components.tsx'
import { useTreeMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import type { DocumentTreeMessages } from '../tree-messages.ts'
import type { Workbench } from '../workbench.ts'
import type { NativeDocumentEditor } from './schema.tsx'

/** The text a synced block link is copied as; pasted into a document, it inserts the synced block. */
const MENTION_DEBOUNCE = 100

const SYNCED_LINK = /^presmium-synced:([^\s/#]+)#([^\s/#]+)$/
export const syncedLinkOf = (document: string, block: string) => `presmium-synced:${encodeURIComponent(document)}#${encodeURIComponent(block)}`
export function parseSyncedLink(text: string): { document: string, block: string } | undefined {
  const match = SYNCED_LINK.exec(text.trim())
  return match ? { document: decodeURIComponent(match[1]!), block: decodeURIComponent(match[2]!) } : undefined
}

function currentTitle(workbench: Workbench, target: ReferenceTarget): string | undefined {
  const own = workbench.getState().authoring?.content
  if (own?.id === target.document) {
    if (target.section) return own.sections[target.section]?.title
    return own.metadata.title
  }
  return target.section || target.block ? undefined : workbench.tree.title(target.document)
}

function previewOf(t: DocumentTreeMessages, workbench: Workbench, target: ReferenceTarget, fallback: string): Promise<DocPreview> {
  const read = workbench.tree.preview(target)
  if (read) return read.then(preview => ({
    path: preview.ancestors, title: preview.title,
    excerpt: preview.missing ? t.previewMissing : preview.trashed ? `${t.previewTrashed} ${preview.excerpt}` : preview.excerpt,
    meta: t.previewMeta(preview.pages, preview.steps, preview.citedBy), missing: preview.missing,
  }))
  const title = workbench.tree.title(target.document)
  return Promise.resolve({ path: workbench.tree.ancestors(target.document).map(item => item.title), title: title ?? fallback, excerpt: title ? '' : t.previewMissing, meta: '', missing: !title })
}

/** An inline reference in the editor: the target's current title as a mention, its preview on hover, Enter or a click to go there. */
// Memoised on primitive props: the editor's node views render again on each edit, a chip only when its target changes.
export const DocumentReference = memo(function DocumentReference({ document, section, block, label, fallback }: { document: string, section?: string, block?: string, label?: string, fallback: string }) {
  const target = useMemo<ReferenceTarget>(() => ({ document, ...section ? { section } : {}, ...block ? { block } : {} }), [document, section, block])
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const tree = useWorkbenchState(state => state.documentTree)
  useWorkbenchState(state => state.authoring?.content?.metadata.title)
  const own = workbench.getState().authoring?.content?.id === target.document
  const missing = Boolean(tree && !own && !tree.nodes[target.document] && !tree.trash.some(entry => entry.id === target.document))
  const title = label ?? currentTitle(workbench, target) ?? fallback
  const open = () => void workbench.tree.openPlace(target, { focus: 'body' })
  return (
    <PmDocPreviewCard label={t.previewLabel} loadingLabel={t.previewLoading} failedLabel={t.previewFailed} load={() => previewOf(t, workbench, target, fallback)}
      actions={<><PmButton small variant="primary" onClick={open}>{t.open}</PmButton><PmButton small icon="rail" onClick={() => workbench.tree.peek(target)}>{t.openOnSide}</PmButton></>}>
      <PmDocMention title={title} missing={missing} missingLabel={fallback || t.missingDocument} onActivate={open} />
    </PmDocPreviewCard>
  )
})

/**
 * What read-only blocks are drawn from: the blocks by ID, their pictures' addresses, and what a reference does. With
 * `onReference`, references are mentions that call it (the document on the side); otherwise plain mentions.
 */
export interface ReadOnlyBlocks {
  blocks?: Record<string, DocumentBlock>
  asset(id: string): string | undefined
  componentLabel(title: string): string
  title?(target: ReferenceTarget): string | undefined
  onReference?(target: ReferenceTarget): void
  embed?(block: EmbedBlock): ReactNode
}

function inlineView(nodes: readonly InlineNode[], view: ReadOnlyBlocks, key = ''): ReactNode[] {
  return nodes.map((node, index) => {
    const id = `${key}${index}`
    if (node.type === 'text') {
      let content: ReactNode = node.text
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') content = <strong>{content}</strong>
        else if (mark.type === 'italic') content = <em>{content}</em>
        else if (mark.type === 'code') content = <code>{content}</code>
        else if (mark.type === 'underline') content = <u>{content}</u>
        else if (mark.type === 'strike') content = <s>{content}</s>
      }
      return <span key={id}>{content}</span>
    }
    if (node.type === 'break') return <br key={id} />
    if (node.type === 'math') return <code key={id}>{node.value}</code>
    if (node.type === 'link') return <span key={id} className="pm-document-editor__synced-link">{inlineView(node.children, view, `${id}-`)}</span>
    if (node.type === 'reference') {
      const title = node.label ?? view.title?.(node.target) ?? node.fallback
      const follow = view.onReference
      if (follow) return <PmDocMention key={id} title={title} onActivate={() => follow(node.target)} />
      return <span key={id} className="pm-ui-doc-mention"><PmIcon name="document" />{title}</span>
    }
    return <span key={id}>{node.fallback}</span>
  })
}

function richView(nodes: readonly RichTextNode[], view: ReadOnlyBlocks): ReactNode[] {
  return nodes.map(node => {
    if (node.type === 'paragraph') return <p key={node.id}>{inlineView(node.children, view)}</p>
    if (node.type === 'heading') { const Heading = `h${Math.min(6, node.level + 1)}` as 'h2'; return <Heading key={node.id}>{inlineView(node.children, view)}</Heading> }
    if (node.type === 'list') { const List = node.ordered ? 'ol' : 'ul'; return <List key={node.id}>{node.children.map(item => <li key={item.id}>{richView(item.children, view)}</li>)}</List> }
    if (node.type === 'blockquote') return <blockquote key={node.id}>{richView(node.children, view)}</blockquote>
    if (node.type === 'code') return <pre key={node.id}><code>{node.value}</code></pre>
    if (node.type === 'math') return <pre key={node.id}><code>{node.value}</code></pre>
    if (node.type === 'table') return <table key={node.id}><tbody>{node.children.map(row => <tr key={row.id}>{row.children.map(cell => <td key={cell.id}>{inlineView(cell.children, view)}</td>)}</tr>)}</tbody></table>
    return <div key={node.id}>{richView(node.fallback, view)}</div>
  })
}

/** A block and its content subtree, read-only, as `view` has them: a synced block's source, or the document on the side. */
export function ReadOnlyBlock({ view, id }: { view: ReadOnlyBlocks, id: string }): ReactNode {
  const block: DocumentBlock | undefined = view.blocks?.[id]
  if (!block) return null
  if (block.type === 'text') return <>{richView(block.content, view)}</>
  if (block.type === 'image') {
    const url = block.assetId ? view.asset(block.assetId) : undefined
    return url ? <img className="pm-document-editor__synced-image" src={url} alt={block.alt} loading="lazy" /> : <p>{block.alt}</p>
  }
  if (block.type === 'code') return <pre><code>{block.value ?? block.title ?? ''}</code></pre>
  if (block.type === 'container') return <>{block.children.map(child => <ReadOnlyBlock key={child} view={view} id={child} />)}</>
  if (block.type === 'component') return <>
    <PmNotice>{view.componentLabel(typeof block.parameters.title === 'string' ? block.parameters.title : '')}</PmNotice>
    {block.children?.map(child => <ReadOnlyBlock key={child} view={view} id={child} />)}
  </>
  if (block.type === 'embed') return view.embed?.(block) ?? null
  return null
}

/** A synced block in the editor: its source's current content, Edit Original and Convert to Copy, or why it is missing. */
export const SyncedBlock = memo(function SyncedBlock({ id, document, block }: { id: string, document: string, block: string }) {
  const source = useMemo(() => ({ document, block }), [document, block])
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const ownId = useWorkbenchState(state => state.authoring?.content?.id)
  const readOnly = useWorkbenchState(state => workbench.client.capabilities?.readOnly === true || state.mode !== 'editing')
  const busy = useWorkbenchState(state => Boolean(state.isDocumentTreeBusy))
  const generation = useWorkbenchState(state => state.documentLinksGeneration)
  const [answer, setAnswer] = useState<EmbedSource | 'loading' | 'failed'>('loading')
  useEffect(() => {
    const read = workbench.tree.embedSource(source)
    if (!read) { setAnswer('failed'); return }
    let active = true
    read.then(value => { if (active) setAnswer(value) }, () => { if (active) setAnswer('failed') })
    return () => { active = false }
  }, [workbench, source.document, source.block, generation])
  const ready = typeof answer === 'object' ? answer : undefined
  const view = useMemo<ReadOnlyBlocks | undefined>(() => ready && { blocks: ready.blocks, asset: asset => ready.assets?.[asset], componentLabel: title => t.syncedComponent(title || ready.title) }, [ready, t])
  const missing = Boolean(ready?.missing || ready && !ready.blocks?.[source.block])
  const state = missing ? 'missing' : ready?.trashed ? 'trashed' : 'default'
  const documentTitle = ready?.title ?? workbench.tree.title(source.document) ?? ''
  const blockLabel = useMemo(() => {
    const block = ready?.blocks?.[source.block]
    if (block?.type === 'text') {
      const first = block.content[0]
      const text = first && 'children' in first && Array.isArray(first.children) ? (first.children as InlineNode[]).map(node => node.type === 'text' ? node.text : '').join('') : ''
      return text.slice(0, 24)
    }
    if (block?.type === 'component') return typeof block.parameters.title === 'string' ? block.parameters.title : ''
    return ''
  }, [ready, source.block])
  const edit = () => void workbench.tree.openPlace({ document: source.document, block: source.block, ...sectionOfBlock(workbench, source) }, { focus: 'body' })
  const convert = async () => {
    if (!ownId) return
    await workbench.flushPendingEdits().catch(() => {})
    if (await workbench.tree.embedToCopy(ownId, id)) workbench.tree.toast(t.converted)
  }
  const actions = <>
    {state !== 'missing' && <PmButton small variant="text" onClick={edit}>{t.editOriginal}</PmButton>}
    {!readOnly && state !== 'missing' && workbench.client.operateTree && <PmButton small variant="text" disabled={busy} onClick={() => void convert()}>{t.convertToCopy}</PmButton>}
  </>
  return (
    <PmSyncedBlockFrame label={t.syncedLabel} state={state} stateLabel={state === 'missing' ? t.sourceMissing : t.sourceTrashed} actions={actions}
      source={<><span>{t.syncedFrom}</span><button type="button" className="pm-ui-synced-block__link" onClick={edit}>{[documentTitle, blockLabel].filter(Boolean).join(' › ')}</button></>}>
      {answer === 'loading' ? <PmSkeleton shape="list" label={t.syncedLoading} />
        : answer === 'failed' ? <p className="pmw-muted">{t.syncedFailed}</p>
          : missing ? <p className="pmw-muted">{t.sourceMissing}</p>
            : <div className="pm-document-editor__synced-content">{view && <ReadOnlyBlock view={view} id={source.block} />}</div>}
    </PmSyncedBlockFrame>
  )
})

function sectionOfBlock(workbench: Workbench, source: { document: string, block: string }): { section?: string } {
  const own = workbench.getState().authoring?.content
  if (own?.id !== source.document) return {}
  const section = Object.values(own.sections).find(item => item.children.includes(source.block))
  return section ? { section: section.id } : {}
}

type MentionItem = { kind: 'document', hit: MentionOption } | { kind: 'create', title: string }

function MentionMenu(props: SuggestionMenuProps<MentionItem> & { query: () => string }) {
  const t = useTreeMessages()
  const options = props.items.flatMap(item => item.kind === 'document' ? [item.hit] : [])
  const create = props.items.find(item => item.kind === 'create')
  const query = props.query()
  return <PmMentionPicker heading={t.linkHeading(query)} options={options} active={props.selectedIndex ?? 0} hint={t.pickerHint} emptyLabel={t.searchEmpty}
    loading={props.loadingState !== 'loaded'} loadingLabel={t.searching} listId="bn-suggestion-menu" optionId={index => `bn-suggestion-menu-item-${index}`}
    createLabel={create ? t.createChildAndLink(create.title) : undefined}
    onSelect={option => props.onItemClick?.(props.items.find(item => item.kind === 'document' && item.hit.id === option.id)!)}
    onCreate={create ? () => props.onItemClick?.(create) : undefined} />
}

function insertReference(editor: NativeDocumentEditor, document: string, title: string): void {
  editor.insertInlineContent([{ type: 'presmiumReference', props: { document, section: '', block: '', label: '', fallback: title } }, ' '])
}

/**
 * Typing @ or [[ in the text opens the document picker: search as you type, the path to tell equal titles apart, and
 * last "New Child Document … and Link", which creates the document under this one and links it without leaving the text.
 */
export function DocumentMentionMenus({ editor }: { editor: NativeDocumentEditor }) {
  const workbench = useWorkbench()
  const query = useRef('')
  // Typing debounces the search and cancels the one in flight; a cancelled call answers the previous results.
  const search = useRef<{ controller?: AbortController, items: MentionItem[] }>({ items: [] })
  // Stable, so that the menu reads again only when the query changes, not when the editor around it renders.
  const getItems = useCallback(async (text: string): Promise<MentionItem[]> => {
    query.current = text
    const own = workbench.getState().authoring?.content?.id
    let hits: DocumentSearchHit[] = []
    const trimmed = text.trim()
    search.current.controller?.abort()
    const controller = search.current.controller = new AbortController()
    if (workbench.client.searchDocuments && trimmed) {
      await new Promise(resolve => setTimeout(resolve, MENTION_DEBOUNCE))
      if (controller.signal.aborted) return search.current.items
      try { hits = await workbench.client.searchDocuments(trimmed, 8, controller.signal) } catch { return search.current.items }
    } else {
      const recent = workbench.getState().recentDocuments ?? []
      hits = recent.filter(entry => entry.id !== own && workbench.tree.title(entry.id) !== undefined).slice(0, 6)
        .map(entry => ({ id: entry.id, title: workbench.tree.title(entry.id)!, ancestors: workbench.tree.ancestors(entry.id).map(item => item.title), match: 'title' as const }))
    }
    const seen = new Set<string>()
    const items: MentionItem[] = hits.filter(hit => !seen.has(hit.id) && seen.add(hit.id)).map(hit => ({ kind: 'document', hit: { id: hit.id, title: hit.title, path: hit.ancestors } }))
    if (trimmed && own && workbench.client.operateTree && workbench.client.capabilities?.readOnly !== true) items.push({ kind: 'create', title: trimmed })
    search.current.items = items
    return items
  }, [workbench])
  const choose = useCallback(async (item: MentionItem) => {
    if (item.kind === 'document') { insertReference(editor, item.hit.id, item.hit.title); return }
    const own = workbench.getState().authoring?.content?.id
    if (!own) return
    const siblings = workbench.getState().documentTree?.nodes[own]?.children
    const result = await workbench.tree.operate({ type: 'create', title: item.title, parent: own, after: siblings?.at(-1) ?? null })
    if (result?.created) insertReference(editor, result.created, item.title)
  }, [workbench, editor])
  const click = useCallback((item: MentionItem) => void choose(item), [choose])
  // Page titles are plain text: the picker opens only in the body, as the slash menu does.
  const inText = useCallback(() => editor.getTextCursorPosition().block.type !== 'presmiumPage', [editor])
  const menu = useMemo(() => (props: SuggestionMenuProps<MentionItem>) => <MentionMenu {...props} query={() => query.current} />, [])
  return <>
    <SuggestionMenuController<(query: string) => Promise<MentionItem[]>> triggerCharacter="@" shouldOpen={inText} getItems={getItems} suggestionMenuComponent={menu} onItemClick={click} />
    <SuggestionMenuController<(query: string) => Promise<MentionItem[]>> triggerCharacter="[[" shouldOpen={inText} getItems={getItems} suggestionMenuComponent={menu} onItemClick={click} />
  </>
}

/** The slash menu's items: Link to Document, Synced Block and Child Document. */
export function referenceSlashItems(editor: NativeDocumentEditor, t: DocumentTreeMessages, group: string, workbench: Workbench, pickSynced: () => void): DefaultReactSuggestionItem[] {
  if (!workbench.client.readTree) return []
  const aliases = (value: string) => value.split('|')
  const items: DefaultReactSuggestionItem[] = [
    { title: t.linkToDocument, subtext: t.linkToDocumentHint, group, aliases: aliases(t.linkAliases), icon: <PmIcon name="reference" />,
      onItemClick: () => editor.getExtension(SuggestionMenuExtension)?.openSuggestionMenu('@') },
  ]
  if (workbench.client.readEmbedSource) items.push({ title: t.syncedBlock, subtext: t.syncedBlockHint, group, aliases: aliases(t.syncedAliases), icon: <PmIcon name="synced" />, onItemClick: pickSynced })
  if (workbench.client.operateTree && workbench.client.capabilities?.readOnly !== true) items.push({ title: t.childDocument, subtext: t.childDocumentHint, group, aliases: aliases(t.childAliases), icon: <PmIcon name="document-add" />,
    onItemClick: () => {
      const own = workbench.getState().authoring?.content?.id
      if (!own) return
      const siblings = workbench.getState().documentTree?.nodes[own]?.children
      void workbench.tree.operate({ type: 'create', title: t.untitled, parent: own, after: siblings?.at(-1) ?? null }).then(result => {
        if (result?.created) insertReference(editor, result.created, t.untitled)
      })
    } })
  return items
}

/** Inserts a synced block after the block with the caret (in place of it when it is an empty paragraph). */
export function insertSyncedBlock(editor: NativeDocumentEditor, source: { document: string, block: string }): void {
  const current = editor.getTextCursorPosition().block
  const block = { type: 'presmiumEmbed' as const, props: source }
  if (current.type === 'paragraph' && Array.isArray(current.content) && current.content.length === 0) editor.replaceBlocks([current], [block])
  else editor.insertBlocks([block], current, 'after')
}

function blockLabel(document: PresmiumDocument, id: string): string {
  const block = document.blocks[id]
  if (!block) return id
  if (block.type === 'text') {
    const text = block.content.map(node => 'children' in node && Array.isArray(node.children) ? (node.children as InlineNode[]).map(child => child.type === 'text' ? child.text : '').join('') : node.type === 'code' ? node.value : '').join(' ').trim()
    return text.slice(0, 60) || id
  }
  if (block.type === 'component') return typeof block.parameters.title === 'string' ? block.parameters.title : document.definitions[block.definitionId]?.kind ?? id
  if (block.type === 'image') return block.alt || id
  if (block.type === 'code') return block.title ?? block.language
  if (block.type === 'container') return block.properties.title ?? id
  return id
}

/** Insert Synced Block: choose a document, then one of its content blocks. */
export function SyncedBlockDialog({ onClose, onInsert }: { onClose(): void, onInsert(source: { document: string, block: string }): void }) {
  const t = useTreeMessages()
  const workbench = useWorkbench()
  const tree = useWorkbenchState(state => state.documentTree)
  const [query, setQuery] = useState('')
  const [documentId, setDocumentId] = useState('')
  const [content, setContent] = useState<PresmiumDocument | 'loading' | 'failed'>()
  const [block, setBlock] = useState('')
  const documents = useMemo(() => Object.values(tree?.nodes ?? {}).map(node => ({ value: node.id, label: node.title || t.untitled, icon: 'document' as const, description: workbench.tree.ancestors(node.id).map(item => item.title).join(' › ') })), [tree, workbench, t])
  useEffect(() => {
    if (!documentId) return
    const dir = workbench.tree.dirOf(documentId)
    if (dir === undefined) { setContent('failed'); return }
    let active = true
    setContent('loading'); setBlock('')
    workbench.client.readDocument(dir).then(answer => { if (active) setContent(answer.content) }, () => { if (active) setContent('failed') })
    return () => { active = false }
  }, [workbench, documentId])
  const blocks = typeof content === 'object' ? content.sectionOrder.flatMap(section => content.sections[section]!.children.map(id => ({ value: id, label: blockLabel(content, id), description: content.sections[section]!.title }))) : []
  return (
    <PmDialog open label={t.insertSynced} closeLabel={t.close} onClose={onClose}
      footer={<><PmButton onClick={onClose}>{t.cancel}</PmButton><PmButton variant="primary" disabled={!documentId || !block} onClick={() => onInsert({ document: documentId, block })}>{t.insert}</PmButton></>}>
      <div className="pm-document-editor__synced-picker">
        <PmSearchList label={t.chooseDocument} searchLabel={t.searchField} searchPlaceholder={t.searchPlaceholder} items={documents} value={documentId} query={query} onQueryChange={setQuery}
          onValueChange={setDocumentId} resultsLabel={t.searchResults} emptyLabel={t.searchEmpty} loadingLabel={t.treeLoading} loading={!tree} autoFocus />
        {documentId && (content === 'loading' ? <PmSkeleton shape="list" label={t.syncedLoading} />
          : content === 'failed' ? <PmNotice tone="danger">{t.syncedFailed}</PmNotice>
            : blocks.length === 0 ? <p className="pmw-muted">{t.noBlocks}</p>
              : <PmSearchList label={t.chooseBlock} searchLabel={t.chooseBlock} items={blocks} value={block} onValueChange={setBlock} onActivate={value => onInsert({ document: documentId, block: value })}
                resultsLabel={t.searchResults} emptyLabel={t.noBlocks} loadingLabel={t.syncedLoading} />)}
      </div>
    </PmDialog>
  )
}

/** The editor's reference tools: the @ and [[ pickers and Insert Synced Block, opened from the slash menu through `picker`. */
export function ReferenceEditorTools({ editor, picker }: { editor: NativeDocumentEditor, picker: { open?: (editor: NativeDocumentEditor) => void } }) {
  const [picking, setPicking] = useState<NativeDocumentEditor>()
  useEffect(() => { picker.open = setPicking; return () => { picker.open = undefined } }, [picker])
  return <>
    <DocumentMentionMenus editor={editor} />
    {picking && <SyncedBlockDialog onClose={() => setPicking(undefined)} onInsert={source => { insertSyncedBlock(picking, source); setPicking(undefined) }} />}
  </>
}
