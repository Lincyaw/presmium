import type { SourceFile } from '../api.ts'
import { PmIcon, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'

function byDirectory(files: SourceFile[], document: string): [string, SourceFile[]][] {
  const groups = new Map<string, SourceFile[]>()
  for (const file of files) {
    const inside = document && file.path.startsWith(`${document}/`) ? file.path.slice(document.length + 1) : file.path
    const at = inside.lastIndexOf('/')
    const dir = at < 0 ? '' : inside.slice(0, at)
    groups.set(dir, [...groups.get(dir) ?? [], file])
  }
  return [...groups.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
}

export function FilesPanel({ onOpen }: { onOpen?(path: string): void }) {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const document = useWorkbench(state => state.document)
  const files = useWorkbench(state => state.files)
  const active = useWorkbench(state => state.active)
  const documents = useWorkbench(state => state.documents)
  const failure = useWorkbench(state => state.openFailure)
  if (document === undefined) return null
  const title = documents?.documents.find(doc => doc.dir === document)?.title ?? document
  return (
    <nav className="pmw-files" aria-label={t.filesOf(title)}>
      <div className="pmw-files__head">
        <PmIconButton icon="arrow-left" label={t.backToDocuments} small onClick={() => workbench.closeDocument()} />
        <h2 className="pmw-files__title">{title}</h2>
      </div>
      {failure && <PmNotice tone="danger">{t.openFailed(failure)}</PmNotice>}
      {files && files.files.length === 0 && <p className="pmw-muted">{t.noFiles}</p>}
      {files && (
        <ul className="pmw-tree" role="tree" aria-label={t.files}>
          {byDirectory(files.files, document).map(([dir, list]) => (
            <li key={dir || '.'} role="treeitem" aria-expanded="true" aria-selected="false">
              {dir && <div className="pmw-tree__dir"><PmIcon name="folder" size={15} />{dir}</div>}
              <ul role="group">
                {list.map(file => (
                  <li key={file.path} role="treeitem" aria-selected={file.path === active}>
                    <button
                      type="button"
                      className="pmw-tree__file"
                      data-path={file.path}
                      data-active={file.path === active || undefined}
                      disabled={file.binary}
                      onClick={() => {
                        void workbench.openFile(file.path)
                        onOpen?.(file.path)
                      }}
                    >
                      <PmIcon name="document" size={15} />
                      {file.path.slice(file.path.lastIndexOf('/') + 1)}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {files?.truncated && <p className="pmw-muted">{t.truncated}</p>}
    </nav>
  )
}
