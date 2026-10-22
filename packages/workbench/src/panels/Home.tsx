import { Command } from 'cmdk'
import { useEffect, useRef, useState } from 'react'
import type { DocumentOperation, DocumentSummary } from '../api.ts'
import { PmBadge, PmButton, PmCard, PmDialog, PmEmpty, PmField, PmIcon, PmMenu, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchStore } from '../react.tsx'

type Editing =
  | { op: 'create' }
  | { op: 'rename' | 'copy' | 'delete', doc: DocumentSummary }

function freeDir(dir: string, taken: string[]): string {
  for (let n = 2; ; n++) {
    const candidate = `${dir}-${n}`
    if (!taken.includes(candidate)) return candidate
  }
}

export function HomePanel() {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const answer = useWorkbench(state => state.documents)
  const failure = useWorkbench(state => state.failure)
  const noRoutes = useWorkbench(state => state.noRoutes)
  const [editing, setEditing] = useState<Editing>()
  const [done, setDone] = useState<string>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    void workbench.loadDocuments()
  }, [workbench])
  const documents = answer?.documents ?? []
  const operable = Boolean(answer?.git) && !answer?.single

  const run = async (operation: DocumentOperation, said: (dir: string) => string) => {
    setError(undefined)
    try {
      const result = await workbench.operate(operation)
      setDone(said(result.dir ?? operation.dir))
      setEditing(undefined)
    } catch (failed) {
      setError(failed instanceof Error ? failed.message : String(failed))
    }
  }

  return (
    <section className="pmw-home" aria-labelledby="pmw-home-title">
      <header className="pmw-home__bar">
        <h1 id="pmw-home-title" className="pmw-home__title">{answer?.title ?? t.workspace}</h1>
        <Search documents={documents} onCreate={() => setEditing({ op: 'create' })} />
        {operable && <PmButton variant="primary" icon="plus" onClick={() => setEditing({ op: 'create' })}>{t.newDocument}</PmButton>}
      </header>
      {failure && <PmNotice tone="danger">{noRoutes ? t.noRoutes : failure}</PmNotice>}
      {done && <PmNotice tone="ok">{done}</PmNotice>}
      {answer && !answer.git && !answer.single && <PmNotice tone="warn">{t.notGit}</PmNotice>}
      <h2 className="pmw-home__heading">{t.documents}</h2>
      {answer && documents.length === 0
        ? <PmEmpty icon="document" title={t.noDocuments} />
        : (
            <ul className="pmw-home__cards" aria-label={t.documents}>
              {documents.map(doc => (
                <li key={doc.dir} className="pmw-home__card" data-document={doc.dir}>
                  <PmCard variant="interactive">
                    <button type="button" className="pmw-home__open" onClick={() => void workbench.openDocument(doc.dir)}>
                      <span className="pmw-home__doc-title">{doc.title}</span>
                      <span className="pmw-home__doc-dir">{doc.dir || '.'}</span>
                    </button>
                    <div className="pmw-home__meta">
                      {doc.lang && <PmBadge tone="outline">{doc.lang}</PmBadge>}
                      {operable && (
                        <PmMenu
                          label={t.more(doc.title)}
                          items={[{ id: 'rename', label: t.rename, icon: 'edit' }, { id: 'copy', label: t.copy, icon: 'copy' }, { id: 'delete', label: t.remove, icon: 'trash', danger: true }]}
                          onSelect={id => setEditing({ op: id as 'rename' | 'copy' | 'delete', doc })}
                        />
                      )}
                    </div>
                  </PmCard>
                </li>
              ))}
            </ul>
          )}
      <McpCard />
      {editing && (
        <OperationDialog
          editing={editing}
          templates={answer?.templates ?? []}
          taken={documents.map(doc => doc.dir)}
          error={error}
          onClose={() => {
            setEditing(undefined)
            setError(undefined)
          }}
          onRun={(operation) => {
            const said = { create: t.created, rename: t.renamed, copy: t.copied, delete: t.removed }[operation.op]
            void run(operation, said)
          }}
        />
      )}
    </section>
  )
}

function OperationDialog({ editing, templates, taken, error, onClose, onRun }: { editing: Editing, templates: string[], taken: string[], error?: string, onClose(): void, onRun(operation: DocumentOperation): void }) {
  const t = useMessages()
  const [dir, setDir] = useState(editing.op === 'create' ? '' : editing.op === 'copy' ? freeDir(editing.doc.dir, taken) : editing.op === 'rename' ? editing.doc.dir : '')
  const [title, setTitle] = useState('')
  const [template, setTemplate] = useState(templates.includes('default') ? 'default' : templates[0] ?? '')
  const label = editing.op === 'create' ? t.newDocument : `${{ rename: t.rename, copy: t.copy, delete: t.remove }[editing.op]} · ${editing.doc.title}`
  const submit = () => {
    if (editing.op === 'create') onRun({ op: 'create', dir: dir.trim(), ...title.trim() ? { title: title.trim() } : {}, ...template ? { template } : {} })
    else if (editing.op === 'delete') onRun({ op: 'delete', dir: editing.doc.dir })
    else onRun({ op: editing.op, dir: editing.doc.dir, to: dir.trim() })
  }
  return (
    <PmDialog open label={label} closeLabel={t.close} name="pmw-operation" onClose={onClose}>
      <form
        className="pmw-operation"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        {editing.op === 'delete'
          ? <p>{t.confirmRemove(editing.doc.title)}</p>
          : (
              <PmField label={editing.op === 'create' ? t.dir : editing.op === 'rename' ? t.renameTo : t.copyTo}>
                <input className="pm-ui-input" name="dir" value={dir} required onChange={event => setDir(event.target.value)} />
              </PmField>
            )}
        {editing.op === 'create' && (
          <>
            <PmField label={t.title}>
              <input className="pm-ui-input" name="title" value={title} onChange={event => setTitle(event.target.value)} />
            </PmField>
            {templates.length > 1 && (
              <PmField label={t.template}>
                <select className="pm-ui-select" name="template" value={template} onChange={event => setTemplate(event.target.value)}>
                  {templates.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
              </PmField>
            )}
          </>
        )}
        {error && <PmNotice tone="danger">{error}</PmNotice>}
        <div className="pmw-operation__actions">
          <PmButton onClick={onClose}>{t.cancel}</PmButton>
          <PmButton type="submit" variant={editing.op === 'delete' ? 'danger' : 'primary'}>
            {editing.op === 'create' ? t.create : { rename: t.rename, copy: t.copy, delete: t.remove }[editing.op]}
          </PmButton>
        </div>
      </form>
    </PmDialog>
  )
}

function Search({ documents, onCreate }: { documents: DocumentSummary[], onCreate(): void }) {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <Command className="pmw-search" label={t.search}>
      <label className="pm-ui-search">
        <PmIcon name="search" size={15} strokeWidth={1.8} />
        <Command.Input ref={input} value={query} aria-label={t.search} placeholder={`${t.search}（${t.searchHint}）`} onValueChange={setQuery} onKeyDown={event => { if (event.key === 'Escape') setQuery('') }} />
      </label>
      {query.trim() && (
        <Command.List className="pmw-search__results" aria-label={t.search}>
          <Command.Empty className="pmw-muted">{t.noMatch}</Command.Empty>
          <Command.Group heading={t.documents}>
            {documents.map(doc => (
              <Command.Item key={doc.dir} value={`${doc.title} ${doc.dir}`} className="pmw-search__item" onSelect={() => { setQuery(''); void workbench.openDocument(doc.dir) }}>
                <PmIcon name="document" size={15} />{doc.title}<span className="pmw-muted">{doc.dir}</span>
              </Command.Item>
            ))}
          </Command.Group>
          <Command.Group heading={t.commands}>
            <Command.Item value={t.newDocument} className="pmw-search__item" onSelect={() => { setQuery(''); onCreate() }}><PmIcon name="plus" size={15} />{t.newDocument}</Command.Item>
          </Command.Group>
        </Command.List>
      )}
    </Command>
  )
}

function McpCard() {
  const t = useMessages()
  const workbench = useWorkbenchStore()
  const [address, setAddress] = useState<string>()
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    workbench.client.workbench().then(answer => setAddress(answer.mcp), () => {})
  }, [workbench])
  if (!address) return null
  return (
    <PmCard className="pmw-home__mcp">
      <h2 className="pmw-home__heading">{t.mcp}</h2>
      <div className="pmw-home__address">
        <code>{address}</code>
        <PmButton
          small
          icon={copied ? 'check' : 'copy'}
          onClick={() => {
            void navigator.clipboard?.writeText(address).catch(() => {})
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? t.copiedAddress : t.copyAddress}
        </PmButton>
      </div>
      <p className="pmw-muted">{t.mcpHint}</p>
    </PmCard>
  )
}
