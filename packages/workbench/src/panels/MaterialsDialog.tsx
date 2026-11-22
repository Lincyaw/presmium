import { useEffect, useRef, useState } from 'react'
import { DOCUMENT_MATERIALS_MAX_BYTES, DOCUMENT_MATERIALS_MAX_FILES } from '@lincyaw/kernel'
import { PmButton, PmDialog, PmNotice, PmTextarea } from '../components.tsx'
import { useMessages, useTreeMessages, useWorkbench } from '../context.tsx'
import { WorkspaceServerError } from '../workspace-client.ts'

const MEBIBYTES = DOCUMENT_MATERIALS_MAX_BYTES / (1 << 20)
const ACCEPTED = '.pdf,.md,.markdown,.txt,.docx,.doc,.pptx,.ppt,.key,.odt,.odp,.rtf,.html,.htm,.csv,.json,.tex,.bib,image/*'

/**
 * Write from Source Material: the author chooses files and may say what they want; the workbench creates the document,
 * keeps the files in its folder, opens it and hands the AI the request.
 */
export function MaterialsDialog({ onClose }: { onClose(): void }) {
  const t = useMessages()
  const tt = useTreeMessages()
  const workbench = useWorkbench()
  const [files, setFiles] = useState<File[]>([])
  const [note, setNote] = useState('')
  const [working, setWorking] = useState(false)
  const [failure, setFailure] = useState<string>()
  const input = useRef<HTMLInputElement>(null)
  const controller = useRef<AbortController>()
  useEffect(() => () => controller.current?.abort(), [])
  const select = (list: FileList | null) => {
    const selected = [...list ?? []]
    if (selected.length > DOCUMENT_MATERIALS_MAX_FILES || selected.reduce((sum, file) => sum + file.size, 0) > DOCUMENT_MATERIALS_MAX_BYTES) {
      setFailure(tt.materialsLimit(DOCUMENT_MATERIALS_MAX_FILES, MEBIBYTES)); setFiles([])
    } else { setFiles(selected); setFailure(undefined) }
  }
  const submit = async () => {
    if (working || !files.length) return
    const pending = controller.current = new AbortController()
    setWorking(true); setFailure(undefined)
    try {
      const { asked } = await workbench.writeFromMaterials(files, note, pending.signal)
      onClose()
      workbench.tree.toast(asked ? tt.materialsSent : tt.materialsNotSent)
    } catch (error) {
      if (pending.signal.aborted) return
      setFailure(error instanceof WorkspaceServerError && error.status === 413 ? tt.materialsLimit(DOCUMENT_MATERIALS_MAX_FILES, MEBIBYTES) : tt.materialsFailed)
      setWorking(false)
    }
  }
  return (
    <PmDialog open label={tt.fromMaterials} closeLabel={t.close} name="pmw-operation" busy={working} onClose={onClose}>
      <form className="pmw-operation" onSubmit={(event) => { event.preventDefault(); void submit() }}>
        <p>{tt.materialsDescription}</p>
        <p className="pmw-muted">{tt.materialsLimits(DOCUMENT_MATERIALS_MAX_FILES, MEBIBYTES)}</p>
        <input ref={input} type="file" multiple hidden accept={ACCEPTED} onChange={(event) => { select(event.currentTarget.files); event.currentTarget.value = '' }} />
        <div className="pmw-operation__actions">
          <PmButton icon="upload" disabled={working} onClick={() => input.current?.click()}>{tt.materialsChoose}</PmButton>
        </div>
        {files.length > 0 && <>
          <p>{tt.materialsSelected(files.length)}</p>
          <ul className="pmw-materials__files">{files.map((file, index) => <li key={`${file.name}-${index}`}>{file.name}</li>)}</ul>
        </>}
        <PmTextarea label={tt.materialsNote} placeholder={tt.materialsNotePlaceholder} rows={3} value={note} disabled={working} maxLength={2000} onChange={event => setNote(event.target.value)} />
        {failure && <PmNotice tone="danger">{failure}</PmNotice>}
        <div className="pmw-operation__actions">
          <PmButton disabled={working} onClick={onClose}>{t.cancel}</PmButton>
          <PmButton type="submit" variant="primary" loading={working} disabled={!files.length}>{tt.materialsSubmit}</PmButton>
        </div>
      </form>
    </PmDialog>
  )
}
