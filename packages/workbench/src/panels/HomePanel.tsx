import { useEffect, useState } from 'react'
import { errorMessage } from '@lincyaw/kernel'
import type { DocumentSummary } from '@lincyaw/kernel'
import { PmButton, PmDialog, PmEmpty, PmField, PmIcon, PmMenu, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'

type Editing =
  | { op: 'create' }
  | { op: 'rename' | 'delete', doc: DocumentSummary }

/** The documents of the workspace: open one, make a new one, rename, copy or delete one. */
export function HomePanel() {
  const t = useMessages()
  const workbench = useWorkbench()
  const answer = useWorkbenchState(state => state.documents)
  const failure = useWorkbenchState(state => state.documentsFailure)
  const bundleDisabled = useWorkbenchState(state => state.isBundleDisabled)
  const [editing, setEditing] = useState<Editing>()
  const [query, setQuery] = useState('')
  const [done, setDone] = useState<string>()
  const [error, setError] = useState<string>()
  const [working, setWorking] = useState(false)
  useEffect(() => {
    void workbench.loadDocuments()
  }, [workbench])
  const documents = answer?.documents ?? []
  const operable = Boolean(answer?.git) && !answer?.single
  const shown = documents.filter(doc => doc.title.toLowerCase().includes(query.trim().toLowerCase()))

  const run = async (work: () => Promise<string>) => {
    setError(undefined)
    setWorking(true)
    try {
      setDone(await work())
      setEditing(undefined)
    } catch (failed) {
      setError(errorMessage(failed))
    } finally {
      setWorking(false)
    }
  }

  return (
    <section className="pmw-home" aria-labelledby="pmw-home-title">
      <header className="pmw-home__bar">
        <h1 id="pmw-home-title" className="pmw-home__title">{answer?.title ?? t.documents}</h1>
        {operable && <PmButton variant="accent" icon="plus" onClick={() => setEditing({ op: 'create' })}>{t.newDocument}</PmButton>}
      </header>
      {failure && <PmNotice tone="danger">{bundleDisabled ? t.bundleDisabled : failure}</PmNotice>}
      {done && <PmNotice tone="ok">{done}</PmNotice>}
      {error && !editing && <PmNotice tone="danger">{error}</PmNotice>}
      {answer && !answer.git && !answer.single && <PmNotice tone="warn">{t.notGit}</PmNotice>}
      <div className="pmw-home__heading-row">
        <h2 className="pmw-home__heading">{t.allDocuments}</h2>
        {documents.length > 6 && (
          <label className="pm-ui-search pmw-home__search">
            <PmIcon name="search" size={16} />
            <input type="search" value={query} placeholder={t.search} aria-label={t.search} onChange={event => setQuery(event.target.value)} />
          </label>
        )}
      </div>
      {answer && documents.length === 0
        ? <PmEmpty icon="document" title={t.noDocuments} />
        : shown.length === 0 && query
          ? <p className="pmw-muted">{t.noMatch}</p>
          : (
              <ul className="pmw-home__cards" aria-label={t.allDocuments}>
                {shown.map(doc => (
                  <li key={doc.dir} className="pmw-home__card" data-document={doc.dir}>
                      <button type="button" className="pmw-home__open" onClick={() => void workbench.openDocument(doc.dir)}>
                        <span className="pmw-home__doc-icon" aria-hidden="true"><PmIcon name="document" size={18} /></span>
                        <span className="pmw-home__doc-title">{doc.title}</span>
                      </button>
                      {operable && (
                        <PmMenu
                          label={t.more(doc.title)}
                          items={[{ id: 'rename', label: t.rename, icon: 'edit' }, { id: 'copy', label: t.makeCopy, icon: 'copy' }, { id: 'delete', label: t.remove, icon: 'trash', danger: true }]}
                          onSelect={(id) => {
                            if (id === 'copy') {
                              const title = t.copyTitle(doc.title)
                              void run(async () => {
                                await workbench.copyDocument(doc.dir, title)
                                return t.copied(title)
                              })
                            } else setEditing({ op: id as 'rename' | 'delete', doc })
                          }}
                        />
                      )}
                  </li>
                ))}
              </ul>
            )}
      {editing && (
        <DocumentDialog
          editing={editing}
          templates={answer?.templates ?? []}
          error={error}
          working={working}
          onClose={() => {
            setEditing(undefined)
            setError(undefined)
          }}
          onCreate={(title, template) => void run(async () => {
            const dir = await workbench.createDocument(title, template)
            void workbench.openDocument(dir)
            return t.created(title)
          })}
          onRename={(doc, title) => void run(async () => {
            await workbench.retitleDocument(doc.dir, title)
            return t.renamed(title)
          })}
          onDelete={doc => void run(async () => {
            await workbench.operateDocument({ op: 'delete', dir: doc.dir })
            return t.removed(doc.title)
          })}
        />
      )}
    </section>
  )
}

function DocumentDialog({ editing, templates, error, working, onClose, onCreate, onRename, onDelete }: {
  editing: Editing
  templates: string[]
  error?: string
  working: boolean
  onClose(): void
  onCreate(title: string, template?: string): void
  onRename(doc: DocumentSummary, title: string): void
  onDelete(doc: DocumentSummary): void
}) {
  const t = useMessages()
  const [title, setTitle] = useState(editing.op === 'rename' ? editing.doc.title : '')
  const [template, setTemplate] = useState(templates.includes('default') ? 'default' : templates[0] ?? '')
  const label = editing.op === 'create' ? t.newDocument : editing.op === 'rename' ? t.rename : t.remove
  return (
    <PmDialog open label={label} closeLabel={t.close} name="pmw-operation" onClose={onClose}>
      <form
        className="pmw-operation"
        onSubmit={(event) => {
          event.preventDefault()
          if (editing.op === 'create') onCreate(title.trim(), template || undefined)
          else if (editing.op === 'rename') onRename(editing.doc, title.trim())
          else onDelete(editing.doc)
        }}
      >
        {editing.op === 'delete'
          ? <><p>{t.confirmRemove(editing.doc.title)}</p><p className="pmw-muted">{t.removeHint}</p></>
          : (
              <PmField label={t.title}>
                <input className="pm-ui-input" value={title} required autoFocus placeholder={t.titlePlaceholder} onChange={event => setTitle(event.target.value)} />
              </PmField>
            )}
        {editing.op === 'create' && templates.length > 1 && (
          <PmField label={t.template}>
            <select className="pm-ui-select" value={template} onChange={event => setTemplate(event.target.value)}>
              {templates.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </PmField>
        )}
        {error && <PmNotice tone="danger">{error}</PmNotice>}
        <div className="pmw-operation__actions">
          <PmButton onClick={onClose}>{t.cancel}</PmButton>
          <PmButton type="submit" variant={editing.op === 'delete' ? 'danger' : 'primary'} disabled={working || (editing.op !== 'delete' && !title.trim())}>
            {editing.op === 'create' ? t.create : editing.op === 'rename' ? t.save : t.remove}
          </PmButton>
        </div>
      </form>
    </PmDialog>
  )
}
