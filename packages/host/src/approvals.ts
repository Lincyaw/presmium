import { createElement as h, useState } from 'react'
import { PmButton, PmNotice, PmPopover } from './design/components.ts'
import { useMessages } from './locale.ts'
import { HOST_MESSAGES } from './messages.ts'
import { approvals } from './control.ts'
import { useStore } from './store.ts'
export function PmApprovals({ placement = 'below' }: { placement?: 'below' | 'above' }) {
  const t = useMessages(HOST_MESSAGES); const [open, setOpen] = useState(false); const [failed, setFailed] = useState<string>(); const pending = useStore(approvals.pending)
  if (!pending.length) return null
  const answer = (id: string, allow: boolean) => { setFailed(undefined); void approvals.answer(id, allow).catch(error => setFailed(String(error))) }
  return h(PmPopover, { open, label: t.approvalsTitle, name: 'pm-approvals', placement: placement === 'above' ? 'above-end' : 'below-end', onOpenChange: setOpen, trigger: h(PmButton, { variant: 'accent', small: true }, t.approvals(pending.length)) }, pending.map(({ id, request }) => h('div', { key: id, 'data-approval': id }, h('p', {}, request.title), h('p', {}, t.from(request.from)), request.detail ? h('pre', { className: 'pm-ui-code' }, request.detail) : null, h(PmButton, { small: true, variant: 'primary', onClick: () => answer(id, true) }, t.allow), h(PmButton, { small: true, onClick: () => answer(id, false) }, t.deny))), failed ? h(PmNotice, { tone: 'danger' }, failed) : null)
}
