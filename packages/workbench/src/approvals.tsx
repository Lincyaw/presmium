import { useEffect, useState } from 'react'
import type { ApprovalRequest } from '@lincyaw/kernel'
import { PmButton, PmNotice, PmPopover } from './components.tsx'
import { useMessages, useWorkbench } from './context.tsx'
import { WorkspaceServerError } from './workspace-client.ts'

interface Pending { id: string, request: ApprovalRequest }

/**
 * The host's operations waiting for the author, such as an external MCP client's import: shown only while one is
 * pending, answered here as in the viewer's "Approvals". The host times them out; a late answer is reported, not retried.
 */
export function WorkbenchApprovals({ density = 'compact' }: { density?: 'compact' | 'touch' }) {
  const { client } = useWorkbench()
  const t = useMessages()
  const [pending, setPending] = useState<Pending[]>([])
  const [open, setOpen] = useState(false)
  const [answering, setAnswering] = useState<string>()
  const [notice, setNotice] = useState<string>()
  useEffect(() => client.subscribeApprovals((event) => {
    if (event.type === 'reset') setPending([])
    else if (event.type === 'settled') setPending(list => list.filter(item => item.id !== event.id))
    else setPending(list => list.some(item => item.id === event.id) ? list : [...list, { id: event.id, request: event.request }])
  }), [client])
  useEffect(() => { if (!pending.length) setOpen(false) }, [pending.length])
  if (!pending.length) return null
  const answer = (id: string, allow: boolean) => {
    setAnswering(id); setNotice(undefined)
    void client.answerApproval(id, allow).then(
      () => setPending(list => list.filter(item => item.id !== id)),
      (error: unknown) => {
        if (error instanceof WorkspaceServerError && error.status === 404) {
          setPending(list => list.filter(item => item.id !== id))
          setNotice(t.approvalExpired)
        } else setNotice(t.approvalFailed)
      },
    ).finally(() => setAnswering(current => current === id ? undefined : current))
  }
  return (
    <PmPopover open={open} onOpenChange={setOpen} label={t.approvalsTitle} name="pmw-approvals" trigger={
      <PmButton variant="accent" density={density}>{t.approvals(pending.length)}</PmButton>
    }>
      <h2 className="pmw-approvals__heading">{t.approvalsTitle}</h2>
      <ul className="pmw-approvals__list">
        {pending.map(({ id, request }) => (
          <li key={id} className="pmw-approvals__item" data-approval={id}>
            <p className="pmw-approvals__title">{request.title}</p>
            <p className="pmw-muted">{t.approvalFrom(t.approvalOrigin[request.from] ?? t.approvalOtherOrigin)}</p>
            {request.detail && <p className="pmw-approvals__detail">{request.detail}</p>}
            <div className="pmw-approvals__actions">
              <PmButton density={density} disabled={answering === id} onClick={() => answer(id, false)}>{t.approvalDeny}</PmButton>
              <PmButton variant="primary" density={density} loading={answering === id ? true : undefined} disabled={answering === id} onClick={() => answer(id, true)}>{t.approvalAllow}</PmButton>
            </div>
          </li>
        ))}
      </ul>
      {notice && <PmNotice tone="warn">{notice}</PmNotice>}
    </PmPopover>
  )
}
