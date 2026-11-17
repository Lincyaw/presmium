import { useEffect, useRef, useState } from 'react'
import { DOCUMENT_IMPORT_MAX_BYTES, DOCUMENT_IMPORT_MAX_FILES } from '@lincyaw/kernel'
import type { DocumentImportAnswer } from '@lincyaw/kernel'
import { PmButton, PmDialog, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { IMPORT_MESSAGES } from '../import-messages.ts'
import { WorkspaceServerError } from '../workspace-client.ts'

/** File objects stay local to the dialog until the author submits one import. */
export function DocumentImportDialog({ onClose, onImported }: { onClose(): void, onImported(answer: DocumentImportAnswer): void }) {
  const t = useMessages()
  const m = IMPORT_MESSAGES[useWorkbenchState(state => state.locale)]
  const workbench = useWorkbench()
  const [files, setFiles] = useState<File[]>([])
  const [working, setWorking] = useState(false)
  const [failure, setFailure] = useState<string>()
  const input = useRef<HTMLInputElement>(null), directory = useRef<HTMLInputElement | null>(null)
  const controller = useRef<AbortController>()
  useEffect(() => () => controller.current?.abort(), [])
  const select = (list: FileList | null) => {
    const selected = [...list ?? []].filter(file => !(file.webkitRelativePath || file.name).split('/').some(part => ['.git', '.presmium', 'node_modules', 'dist'].includes(part)))
    if (selected.length > DOCUMENT_IMPORT_MAX_FILES || selected.reduce((sum, file) => sum + file.size, 0) > DOCUMENT_IMPORT_MAX_BYTES) {
      setFailure(m.errors['document-import-limit']); setFiles([])
    } else { setFiles(selected); setFailure(undefined) }
  }
  const submit = async () => {
    if (working || !files.length) return
    const pending = controller.current = new AbortController()
    setWorking(true); setFailure(undefined)
    try {
      const answer = await workbench.importDocuments(files, pending.signal)
      onImported(answer)
    } catch (error) {
      if (!pending.signal.aborted) {
        const code = error instanceof WorkspaceServerError ? error.answer.error : error instanceof Error ? error.message : undefined
        setFailure(code ? (m.errors as Record<string, string>)[code] ?? m.failed : m.failed)
      }
    } finally { if (!pending.signal.aborted) setWorking(false) }
  }
  return (
    <PmDialog open label={m.title} closeLabel={t.close} name="pmw-operation" busy={working} onClose={onClose}>
      <form className="pmw-operation" onSubmit={event => { event.preventDefault(); void submit() }}>
        <p>{m.description}</p><p className="pmw-muted">{m.images}</p><p className="pmw-muted">{m.limits}</p>
        <input ref={input} type="file" multiple hidden accept=".md,.markdown,.docx,image/*" onChange={event => { select(event.currentTarget.files); event.currentTarget.value = '' }} />
        <input ref={element => { directory.current = element; element?.setAttribute('webkitdirectory', '') }} type="file" multiple hidden onChange={event => { select(event.currentTarget.files); event.currentTarget.value = '' }} />
        <div className="pmw-operation__actions">
          <PmButton icon="upload" disabled={working} onClick={() => input.current?.click()}>{m.files}</PmButton>
          <PmButton icon="folder" disabled={working} onClick={() => directory.current?.click()}>{m.folder}</PmButton>
        </div>
        {files.length > 0 && <p>{m.selected(files.length)}</p>}
        {failure && <PmNotice tone="danger">{failure}</PmNotice>}
        <div className="pmw-operation__actions">
          <PmButton disabled={working} onClick={onClose}>{t.cancel}</PmButton>
          <PmButton type="submit" variant="primary" loading={working} disabled={!files.length}>{m.submit}</PmButton>
        </div>
      </form>
    </PmDialog>
  )
}
