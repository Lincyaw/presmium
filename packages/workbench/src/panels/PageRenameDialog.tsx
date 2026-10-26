import { useState } from 'react'
import { PmButton, PmDialog, PmInput } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'

/** The submitted title stays local until the source write and compiled page are acknowledged. */
export function PageRenameDialog({ section, title: original, trigger, onClose }: { section: string, title: string, trigger?: HTMLButtonElement, onClose(): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const busy = useWorkbenchState(state => Boolean(state.isEditingPage))
  const failure = useWorkbenchState(state => state.pageEditFailure)
  const [title, setTitle] = useState(original)
  return <PmDialog open label={t.pageRenameTitle} closeLabel={t.close} busy={busy} onClose={onClose} onCloseAutoFocus={event => { if (trigger?.isConnected) { event.preventDefault(); trigger.focus() } }}>
    <form className="pmw-operation" onKeyDown={event => {
      if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) event.preventDefault()
    }} onSubmit={event => {
      event.preventDefault()
      if (busy || !title.trim()) return
      void workbench.renamePage(section, title.trim()).then(saved => { if (saved) onClose() })
    }}>
      <PmInput label={t.pageTitle} density="regular" value={title} error={failure} required autoFocus readOnly={busy} onChange={event => setTitle(event.target.value)} />
      <div className="pmw-operation__actions">
        <PmButton disabled={busy} onClick={onClose}>{t.cancel}</PmButton>
        <PmButton type="submit" variant="primary" loading={busy} disabled={!title.trim()}>{t.save}</PmButton>
      </div>
    </form>
  </PmDialog>
}
