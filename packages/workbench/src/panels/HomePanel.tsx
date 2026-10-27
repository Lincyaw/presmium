import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '@lincyaw/kernel'
import type { DocumentSummary, ProjectPlan } from '@lincyaw/kernel'
import { PmButton, PmDialog, PmEmpty, PmInput, PmSelect, PmIcon, PmMenu, PmNotice } from '../components.tsx'
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
  const handingOff = useRef(false)
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
        {operable && <PmButton variant="primary" icon="plus" disabled={working} onClick={() => { handingOff.current = false; setError(undefined); setEditing({ op: 'create' }) }}>{t.newDocument}</PmButton>}
      </header>
      {failure && <PmNotice tone="danger">{bundleDisabled ? t.bundleDisabled : failure}</PmNotice>}
      {done && <PmNotice tone="ok">{done}</PmNotice>}
      {error && !editing && <PmNotice tone="danger">{error}</PmNotice>}
      {answer && !answer.git && !answer.single && <PmNotice tone="warn">{t.notGit}</PmNotice>}
      <div className="pmw-home__heading-row">
        <h2 className="pmw-home__heading">{t.allDocuments}</h2>
        {documents.length > 6 && (
          <div className="pmw-home__search"><PmInput label={t.search} type="search" prefixIcon="search" value={query} placeholder={t.search} onChange={event => setQuery(event.target.value)} /></div>
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
                        <span className="pmw-home__doc-icon" aria-hidden="true"><PmIcon name="document" /></span>
                        <span className="pmw-home__doc-title">{doc.title}</span>
                      </button>
                      {operable && (
                        <PmMenu
                          label={t.more(doc.title)}
                          items={[{ id: 'rename', label: t.rename, icon: 'edit', disabled: working }, { id: 'copy', label: t.makeCopy, icon: 'copy', disabled: working || doc.dir === '' }, { id: 'delete', label: t.remove, icon: 'trash', danger: true, disabled: working || doc.dir === '' }]}
                          onSelect={(id) => {
                            if (id === 'copy') {
                              const title = t.copyTitle(doc.title)
                              void run(async () => {
                                await workbench.copyDocument(doc.dir, title)
                                return t.copied(title)
                              })
                            } else { setError(undefined); setEditing({ op: id as 'rename' | 'delete', doc }) }
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
          onCloseAutoFocus={event => {
            if (!handingOff.current) return
            handingOff.current = false
            event.preventDefault()
          }}
          onCreate={(title, template) => void run(async () => {
            const dir = await workbench.createDocument(title, template)
            handingOff.current = true
            await workbench.openDocument(dir, { focus: 'body' })
            return t.created(title)
          })}
          onRename={(doc, title) => void run(async () => {
            await workbench.retitleDocument(doc.dir, title)
            return t.renamed(title)
          })}
          onDelete={(doc, plan) => void run(async () => {
            await workbench.operateDocument({ op: 'delete', dir: doc.dir }, plan)
            return t.removed(doc.title)
          })}
        />
      )}
    </section>
  )
}

function DocumentDialog({ editing, templates, error, working, onClose, onCloseAutoFocus, onCreate, onRename, onDelete }: {
  editing: Editing
  templates: string[]
  error?: string
  working: boolean
  onClose(): void
  onCloseAutoFocus(event: Event): void
  onCreate(title: string, template?: string): void
  onRename(doc: DocumentSummary, title: string): void
  onDelete(doc: DocumentSummary, plan: ProjectPlan): void
}) {
  const t = useMessages()
  const workbench = useWorkbench()
  const [plan, setPlan] = useState<ProjectPlan>()
  const [planFailure, setPlanFailure] = useState<string>()
  useEffect(() => {
    if (editing.op !== 'delete') return
    let active = true
    void workbench.planDocumentOperation({ op: 'delete', dir: editing.doc.dir }).then(value => { if (active) setPlan(value) }, error => { if (active) setPlanFailure(errorMessage(error)) })
    return () => { active = false }
  }, [workbench, editing])
  const [title, setTitle] = useState(editing.op === 'rename' ? editing.doc.title : '')
  const [template, setTemplate] = useState(templates.includes('default') ? 'default' : templates[0] ?? '')
  const label = editing.op === 'create' ? t.newDocument : editing.op === 'rename' ? t.rename : t.remove
  return (
    <PmDialog open label={label} closeLabel={t.close} name="pmw-operation" busy={working} onClose={onClose} onCloseAutoFocus={onCloseAutoFocus}>
      <form
        className="pmw-operation"
        onKeyDown={event => { if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault() }}
        onSubmit={(event) => {
          event.preventDefault()
          if (working) return
          if (editing.op === 'create') onCreate(title.trim(), template || undefined)
          else if (editing.op === 'rename') onRename(editing.doc, title.trim())
          else if (plan) onDelete(editing.doc, plan)
        }}
      >
        {editing.op === 'delete'
          ? <><p>{t.confirmRemove(editing.doc.title)}</p><p className="pmw-muted">{plan ? t.removeImpact(plan.impact.files) : planFailure ?? t.projectInspecting}</p></>
          : (
              <PmInput label={t.title} density="regular" value={title} required autoFocus readOnly={working} placeholder={t.titlePlaceholder} onChange={event => setTitle(event.target.value)} />
            )}
        {editing.op === 'create' && templates.length > 1 && (
            <PmSelect label={t.template} density="regular" value={template} disabled={working} onChange={event => setTemplate(event.target.value)}>
              {templates.map(name => <option key={name} value={name}>{name}</option>)}
            </PmSelect>
        )}
        {error && <PmNotice tone="danger">{error}</PmNotice>}
        <div className="pmw-operation__actions">
          <PmButton disabled={working} onClick={onClose}>{t.cancel}</PmButton>
          <PmButton type="submit" variant={editing.op === 'delete' ? 'danger' : 'primary'} loading={working} disabled={editing.op === 'delete' ? !plan : !title.trim()}>
            {editing.op === 'create' ? t.create : editing.op === 'rename' ? t.save : t.remove}
          </PmButton>
        </div>
      </form>
    </PmDialog>
  )
}
