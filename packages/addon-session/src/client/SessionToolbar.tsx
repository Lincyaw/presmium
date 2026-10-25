import { useState } from 'react'
import { PmButton, PmPopover, useMessages } from '@lincyaw/host'
import { MESSAGES, shortStatus, statusText } from '../domain/index.ts'
import { useClassroomSession } from './composables.ts'
import SessionOverlays from './SessionOverlays.tsx'
import SessionPanel from './SessionPanel.tsx'
import './SessionToolbar.css'
export default function SessionToolbar() {
  const t = useMessages(MESSAGES)
  const [open, setOpen] = useState(false)
  const { snapshot } = useClassroomSession()
  return (
    <span className="pm-session-toolbar">
      {snapshot && (
        <PmPopover
          open={open}
          onOpenChange={setOpen}
          label={t.classroom}
          name="pm-session-popover"
          trigger={
            <PmButton variant="ghost" small title={statusText(snapshot, t)} aria-expanded={open}>
              <span
                className="pm-session-toolbar__dot pm-ui-dot"
                data-connection={snapshot.server ? snapshot.connection : 'none'}
                aria-hidden="true"
              />
              {t.classroom}
              <span className="pm-session-toolbar__state">{shortStatus(snapshot, t)}</span>
            </PmButton>
          }
        >
          <SessionPanel />
          <PmButton small className="pm-session-popover__close" onClick={() => setOpen(false)}>
            {t.close}
          </PmButton>
        </PmPopover>
      )}
      <SessionOverlays />
    </span>
  )
}
