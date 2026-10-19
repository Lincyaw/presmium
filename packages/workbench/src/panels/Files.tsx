import { Tree } from 'react-arborist'
import type { NodeRendererProps } from 'react-arborist'
import { useMemo } from 'react'
import type { SourceFile } from '../api.ts'
import { PmIcon, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'

interface FileNode {
  id: string
  name: string
  file?: SourceFile
  children?: FileNode[]
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
  return root.children!
}

function FileRow({ node, style }: NodeRendererProps<FileNode>) {
  return (
    <button type="button" tabIndex={-1} style={style} className="pmw-tree__file" data-path={node.data.file?.path} data-active={node.isSelected || undefined} disabled={node.data.file?.binary} onClick={() => node.isInternal ? node.toggle() : node.activate()}>
      <PmIcon name={node.isInternal ? 'folder' : 'document'} size={15} />{node.data.name}
    </button>
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
  const data = useMemo(() => fileTree(files?.files ?? [], files?.home ? '' : document ?? ''), [files, document])
  if (document === undefined) return null
  const title = files?.home ? documents?.title ?? t.workspace : documents?.documents.find(doc => doc.dir === document)?.title ?? (document || documents?.title || t.workspace)
  return (
    <nav className="pmw-files" aria-label={t.filesOf(title)}>
      <div className="pmw-files__head">
        <PmIconButton icon="arrow-left" label={t.backToDocuments} small onClick={() => workbench.closeDocument()} />
        <h2 className="pmw-files__title">{title}</h2>
      </div>
      {failure && <PmNotice tone="danger">{t.openFailed(failure)}</PmNotice>}
      {files && files.files.length === 0 && <p className="pmw-muted">{t.noFiles}</p>}
      {files && (
        <Tree<FileNode> className="pmw-tree" data={data} selection={active} width="100%" height={Math.min(480, Math.max(96, (files.files.length + data.length) * 32))} rowHeight={32} indent={16} openByDefault disableDrag disableDrop disableEdit disableMultiSelection disableSelect={node => Boolean(node.file?.binary)} aria-label={t.files} onActivate={node => {
          if (!node.data.file || node.data.file.binary) return
          void workbench.openFile(node.data.file.path)
          onOpen?.(node.data.file.path)
        }}>
          {FileRow}
        </Tree>
      )}
      {files?.truncated && <p className="pmw-muted">{t.truncated}</p>}
    </nav>
  )
}
