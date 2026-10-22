import { Command, defaultFilter } from 'cmdk'
import { useEffect, useRef, useState } from 'react'
import { errorMessage } from '@lincyaw/kernel'
import type { FilesAnswer } from '@lincyaw/kernel'
import { PmDialog, PmIcon, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { WORKSPACE_SCOPE } from '../workbench.ts'
import type { DocumentPane } from './EditorGroup.tsx'

/** The activity bar's search: Quick Open of the workspace's files and documents, and the command palette. It stays available while a lecture, editor or conversation is open. */
export function QuickOpen({ onNavigate }: { onNavigate?(pane: DocumentPane): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const documents = useWorkbenchState(state => state.documents)
  const document = useWorkbenchState(state => state.document)
  const activeFile = useWorkbenchState(state => state.activeFile)
  const leaving = useWorkbenchState(state => state.unsavedOnLeave)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<FilesAnswer>()
  const [failure, setFailure] = useState<string>()
  const [destination, setDestination] = useState<string>()
  const request = useRef(0)
  const returnFocus = useRef<HTMLElement | null>(null)
  const shown = useRef(false)
  const navigating = useRef(false)
  const commands = query.startsWith('>')
  const location = /:(\d+)$/.exec(query)

  const show = (commands = false) => {
    if (!shown.current) returnFocus.current = globalThis.document.activeElement as HTMLElement | null
    shown.current = true
    navigating.current = false
    setQuery(commands ? '>' : '')
    setFailure(undefined)
    setOpen(true)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'p') return
      event.preventDefault()
      event.stopPropagation()
      show(event.shiftKey)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => workbench.subscribePreviewShortcuts(command => show(command === 'open-commands')), [workbench])

  useEffect(() => {
    if (destination === undefined) return
    if (document === destination) {
      setDestination(undefined)
      onNavigate?.('preview')
    } else if (!leaving) setDestination(undefined)
  }, [destination, document, leaving, onNavigate])

  useEffect(() => {
    if (!open) return
    const version = ++request.current
    setFiles(undefined)
    void workbench.client.readFiles(WORKSPACE_SCOPE).then(answer => {
      if (version === request.current) setFiles(answer)
    }, error => {
      if (version === request.current) setFailure(errorMessage(error))
    })
    return () => { request.current++ }
  }, [open, workbench])

  const run = (action: () => void | Promise<void>, focusSource = false) => {
    navigating.current = focusSource
    setOpen(false)
    void action()
  }
  const source = (path: string) => run(async () => {
    await workbench.openWorkspaceFile(path, location ? { line: Number(location[1]) } : {})
    if (workbench.state.activeFile === path) onNavigate?.('source')
    else if (workbench.state.openFailure) {
      setFailure(workbench.state.openFailure)
      setOpen(true)
    }
  }, true)
  const layouts = [{ value: 'source' as const, label: t.source }, { value: 'split' as const, label: t.split }, { value: 'preview' as const, label: t.preview }]

  return <>
    <PmIconButton icon="search" label={t.quickOpen} className="pmw-activity__button" onClick={() => show()} />
    <PmDialog open={open} label={commands ? t.commandPalette : t.quickOpen} closeLabel={t.close} name="pmw-commands" onClose={() => setOpen(false)} onCloseAutoFocus={event => {
      event.preventDefault()
      if (!navigating.current && returnFocus.current?.isConnected) returnFocus.current.focus()
      shown.current = false
    }}>
      <Command className="pmw-commands" label={t.quickOpenQuery} filter={(value, query, keywords) => defaultFilter(value, query.startsWith('>') ? query.slice(1).trimStart() : query.replace(/:\d+$/, ''), keywords)}>
        <Command.Input autoFocus value={query} onValueChange={setQuery} aria-label={t.quickOpenQuery} placeholder={t.quickOpenHint} className="pm-ui-input" />
        {failure && <PmNotice tone="danger">{t.openFailed(failure)}</PmNotice>}
        <Command.List className="pmw-commands__results">
          {!commands && !files && !failure && <Command.Loading className="pmw-muted">{t.loadingFiles}</Command.Loading>}
          <Command.Empty className="pmw-muted">{t.noMatch}</Command.Empty>
          {!commands && <Command.Group heading={t.files}>
            {(files?.files ?? []).filter(file => !file.binary).map(file => <Command.Item key={file.path} value={file.path} className="pmw-search__item" onSelect={() => source(file.path)}>
              <PmIcon name="document" size={15} /><span>{file.path}</span>
            </Command.Item>)}
          </Command.Group>}
          {!commands && <Command.Group heading={t.documents}>
            {(documents?.documents ?? []).map(doc => <Command.Item key={doc.dir} value={`document:${doc.dir}`} keywords={[doc.title, doc.dir]} className="pmw-search__item" onSelect={() => run(() => { setDestination(doc.dir); return workbench.openDocument(doc.dir) })}>
              <PmIcon name="slides" size={15} /><span>{doc.title}</span><span className="pmw-muted">{doc.dir}</span>
            </Command.Item>)}
          </Command.Group>}
          {commands && <Command.Group heading={t.commands}>
            {document !== undefined && layouts.map(layout => <Command.Item key={layout.value} value={`>${t.showLayout(layout.label)}`} className="pmw-search__item" onSelect={() => run(() => { workbench.setLayout(layout.value); onNavigate?.(layout.value === 'preview' ? 'preview' : 'source') })}>
              {t.showLayout(layout.label)}
            </Command.Item>)}
            {activeFile && <Command.Item value={`>${t.save}`} className="pmw-search__item" onSelect={() => run(() => workbench.save())}>{t.save}</Command.Item>}
            <Command.Item value={`>${t.backToDocuments}`} className="pmw-search__item" onSelect={() => run(() => workbench.closeDocument())}>{t.backToDocuments}</Command.Item>
          </Command.Group>}
        </Command.List>
        {!commands && files?.truncated && <p className="pmw-muted">{t.truncated}</p>}
        <p className="pmw-muted pmw-commands__hint">{t.quickOpenHelp}</p>
      </Command>
    </PmDialog>
  </>
}
