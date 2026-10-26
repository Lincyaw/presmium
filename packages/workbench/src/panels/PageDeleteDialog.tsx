import { useEffect, useState } from 'react'
import type { PageDeletePlan } from '@lincyaw/kernel'
import { PmButton, PmDialog, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'

/** Confirmation is prepared from the source version after pending document edits have finished. */
export function PageDeleteDialog({ section, title, trigger, onClose }: { section: string, title: string, trigger?: HTMLButtonElement, onClose(): void }) {
  const t = useMessages(), workbench = useWorkbench()
  const [plan, setPlan] = useState<PageDeletePlan>(), [loading, setLoading] = useState(true), [error, setError] = useState<string>(), [attempt, setAttempt] = useState(0)
  const busy = useWorkbenchState(state => Boolean(state.isEditingPage))
  const failure = useWorkbenchState(state => state.pageEditFailure)
  useEffect(() => {
    let current = true
    setLoading(true); setError(undefined)
    void workbench.preparePageDeletion(section).then(answer => { if (current) setPlan(answer) }, () => { if (current) setError(t.pageEditRequestFailed) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [workbench, section, attempt])
  return <PmDialog open label={t.pageDeleteTitle(title)} description={plan ? t.pageDeleteHint(plan.counts.steps, plan.counts.narration) : t.pageDeleteLoading} busy={busy} closeLabel={t.close} onClose={onClose} onCloseAutoFocus={event => {
    const target = trigger?.isConnected ? trigger : document.querySelector<HTMLElement>('.pmw-navigation__item[aria-current]')
    if (target) { event.preventDefault(); target.focus() }
  }}>
    <div className="pmw-operation">
      {plan?.last && <PmNotice>{t.pageDeleteLast}</PmNotice>}
      {plan && !plan.allowed && <PmNotice tone="warn">{workbench.pageDeleteMessage(plan.reason ?? 'page-boundary')}</PmNotice>}
      {(error || failure) && <PmNotice tone="danger">{error || failure}</PmNotice>}
      <div className="pmw-operation__actions">
        <PmButton disabled={busy} onClick={onClose}>{t.cancel}</PmButton>
        {error || failure ? <PmButton disabled={busy} onClick={() => { workbench.clearPageEditFailure(); setAttempt(value => value + 1) }}>{t.retry}</PmButton>
          : <PmButton variant="danger" loading={loading || busy} disabled={!plan?.allowed || loading} onClick={() => { if (plan) void workbench.deletePage(plan).then(saved => { if (saved) onClose() }) }}>{t.pageDelete}</PmButton>}
      </div>
    </div>
  </PmDialog>
}
