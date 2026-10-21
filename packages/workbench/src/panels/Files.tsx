import { Tree } from 'react-arborist'
import type { NodeRendererProps, TreeApi } from 'react-arborist'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SourceFile } from '../api.ts'
import { PmButton, PmDialog, PmField, PmIcon, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'
import { ServiceError } from '../service.ts'

interface FileNode {
  id: string
  name: string
  file?: SourceFile
  children?: FileNode[]
}

const TREE_STATE = 'presmium.workbench.files'
const INDENT = 16
const TWISTIE = 16

type OpenState = Record<string, boolean>

function storedTree(key: string): OpenState | undefined {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(TREE_STATE) ?? '{}')
    if (!all || typeof all !== 'object' || Array.isArray(all)) return undefined
    const open = (all as Record<string, unknown>)[key]
    if (!open || typeof open !== 'object' || Array.isArray(open)) return undefined
    return Object.fromEntries(Object.entries(open).filter(([, value]) => value === true))
  } catch {
    return undefined
  }
}

function rememberTree(key: string, open: OpenState): void {
  try {
    const all: unknown = JSON.parse(localStorage.getItem(TREE_STATE) ?? '{}')
    const state = all && typeof all === 'object' && !Array.isArray(all) ? all as Record<string, unknown> : {}
    state[key] = Object.fromEntries(Object.entries(open).filter(([, value]) => value))
    localStorage.setItem(TREE_STATE, JSON.stringify(state))
  } catch {}
}

function fileTree(files: SourceFile[], document: string): FileNode[] {
  const root: FileNode = { id: '', name: '', children: [] }
  for (const file of files) {
    const parts = (document && file.path.startsWith(`${document}/`) ? file.path.slice(document.length + 1) : file.path).split('/')
    let parent = root
    for (const [i, name] of parts.entries()) {
      const leaf = i === parts.length - 1
      const id = leaf ? file.path : `directory:${parts.slice(0, i + 1).join('/')}`
      let child = parent.children!.find(node => node.id === id)
      if (!child) {
        child = { id, name, ...leaf ? { file } : { children: [] } }
        parent.children!.push(child)
      }
      parent = child
    }
  }
  sortTree(root.children!)
  return root.children!
}

function sortTree(nodes: FileNode[]): void {
  nodes.sort((a, b) => Number(Boolean(a.file)) - Number(Boolean(b.file)) || a.name.localeCompare(b.name))
  for (const node of nodes) if (node.children) sortTree(node.children)
}

function FileRow({ node, style }: NodeRendererProps<FileNode>) {
  const open = node.isInternal && node.isOpen
  return (
    <div className="pmw-tree__row" style={style} data-active={node.isSelected || undefined}>
      {Array.from({ length: node.level }, (_, i) => (
        <span key={i} className="pmw-tree__guide" style={{ left: i * INDENT + TWISTIE }} aria-hidden="true" />
      ))}
      <button
        type="button"
        tabIndex={-1}
        className="pmw-tree__file"
        data-path={node.data.file?.path}
        data-node={node.id}
        data-open={node.isInternal ? open : undefined}
        data-active={node.isSelected || undefined}
        title={node.data.file?.path ?? node.data.name}
        disabled={node.data.file?.binary}
      >
        <span className="pmw-tree__twistie" data-open={open || undefined} aria-hidden="true">
          {node.isInternal && <PmIcon name="chevron-right" size={14} />}
        </span>
        <PmIcon name={node.isInternal ? 'folder' : 'document'} size={15} />
        <span className="pmw-tree__name">{node.data.name}</span>
      </button>
    </div>
  )
}

export function FilesPanel({ onOpen }: { onOpen?(path: string): void }) {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const document = useWorkbench(state => state.document)
  const files = useWorkbench(state => state.files)
  const active = useWorkbench(state => state.active)
  const documents = useWorkbench(state => state.documents)
  const failure = useWorkbench(state => state.openFailure)
  const [creating, setCreating] = useState(false)
  const data = useMemo(() => fileTree(files?.files ?? [], files?.home ? '' : document ?? ''), [files, document])
  const scope = files?.home ? 'workspace' : `document:${document ?? ''}`
  const initialOpenState = storedTree(scope)
  const tree = useRef<TreeApi<FileNode>>()
  const revealed = useRef<{ tree: TreeApi<FileNode>, path: string }>()
  useEffect(() => {
    const current = tree.current
    if (!current) return
    if (!active) {
      revealed.current = undefined
      return
    }
    if (revealed.current?.tree === current && revealed.current.path === active) return
    revealed.current = { tree: current, path: active }
    void current.scrollTo(active)?.then(() => {
      if (tree.current === current) current.select(active, { focus: false })
    })
  }, [active, data])
  if (document === undefined) return null
  const title = files?.home ? documents?.title ?? t.workspace : documents?.documents.find(doc => doc.dir === document)?.title ?? (document || documents?.title || t.workspace)
  return (
    <nav className="pmw-files" aria-label={t.filesOf(title)}>
      <div className="pmw-files__head">
        <PmIconButton icon="arrow-left" label={t.backToDocuments} small onClick={() => workbench.closeDocument()} />
        <h2 className="pmw-files__title">{title}</h2>
        <PmIconButton icon="plus" label={t.newFile} small onClick={() => setCreating(true)} />
      </div>
      {failure && <PmNotice tone="danger">{t.openFailed(failure)}</PmNotice>}
      {files && files.files.length === 0 && <p className="pmw-muted">{t.noFiles}</p>}
      {files && (
        <div
          className="pmw-tree__box"
          onKeyDown={event => {
            if (event.key !== 'Enter' || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return
            const node = tree.current?.focusedNode
            if (!node || node.data.file?.binary) return
            event.preventDefault()
            if (node.isInternal) node.toggle()
            else node.activate()
          }}
        >
          <Tree<FileNode>
            ref={tree}
            className="pmw-tree"
            data={data}
            selection={active}
            width="100%"
            height={Math.min(480, Math.max(96, (files.files.length + data.length) * 32))}
            rowHeight={32}
            indent={INDENT}
            openByDefault={false}
            initialOpenState={initialOpenState}
            disableDrag
            disableDrop
            disableEdit
            disableMultiSelection
            disableSelect={node => Boolean(node.file?.binary)}
            aria-label={t.files}
            onToggle={() => {
              const current = tree.current
              if (current) rememberTree(scope, current.openState)
            }}
            onActivate={node => {
              if (node.isInternal) {
                node.toggle()
                return
              }
              if (!node.data.file || node.data.file.binary) return
              void workbench.openFile(node.data.file.path)
              onOpen?.(node.data.file.path)
            }}
          >
            {FileRow}
          </Tree>
        </div>
      )}
      {files?.truncated && <p className="pmw-muted">{t.truncated}</p>}
      {creating && <NewFileDialog
        initialPath={active?.slice(0, active.lastIndexOf('/') + 1) ?? (document ? `${document}/` : '')}
        onClose={() => setCreating(false)}
        onCreated={path => { setCreating(false); onOpen?.(path) }}
      />}
    </nav>
  )
}

function NewFileDialog({ initialPath, onClose, onCreated }: { initialPath: string, onClose(): void, onCreated(path: string): void }) {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const [path, setPath] = useState(initialPath)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string>()
  const created = useRef<string>()
  const create = async () => {
    const next = path.trim()
    if (!next || busy) return
    setBusy(true)
    setFailure(undefined)
    try {
      await workbench.createFile(next)
      created.current = next
      onCreated(next)
    } catch (error) {
      setFailure(error instanceof ServiceError && error.answer.exists ? t.fileExists(next) : t.createFileFailed(error instanceof Error ? error.message : String(error)))
    } finally {
      setBusy(false)
    }
  }
  return <PmDialog
    open
    label={t.newFile}
    closeLabel={t.close}
    onClose={() => { if (!busy) onClose() }}
    onCloseAutoFocus={event => {
      if (!created.current) return
      event.preventDefault()
      void workbench.openSource('', created.current)
    }}
  >
    <form className="pmw-operation" onSubmit={event => { event.preventDefault(); void create() }}>
      <PmField label={t.filePath}>
        <input className="pm-ui-input" name="path" value={path} required disabled={busy} placeholder="src/database.py" onChange={event => setPath(event.target.value)} />
      </PmField>
      <p className="pmw-muted">{t.newFileHint}</p>
      {failure && <PmNotice tone="danger">{failure}</PmNotice>}
      <div className="pmw-operation__actions">
        <PmButton disabled={busy} onClick={onClose}>{t.cancel}</PmButton>
        <PmButton type="submit" disabled={busy || !path.trim()} variant="primary">{t.create}</PmButton>
      </div>
    </form>
  </PmDialog>
}
