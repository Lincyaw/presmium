import { useState } from 'react'
import { PmButton, PmPopover, useMessages } from '@lincyaw/host'
import { ASSISTANT_MESSAGES as MESSAGES } from '../domain/index.ts'
import { useWebViewerAccess } from './state.ts'
import AskPanel from './AskPanel.tsx'
import './AssistantToolbar.css'
export default function AssistantToolbar() {
  const t = useMessages(MESSAGES)
  const [open, setOpen] = useState(false)
  useWebViewerAccess()
  return (
    <span className="pm-assistant-toolbar">
      {true && (
        <PmPopover
          open={open}
          onOpenChange={setOpen}
          label={t.panel.title}
          name="pm-assistant-popover"
          trigger={
            <PmButton variant="ghost" small title={t.toolbar.title} aria-expanded={open}>
              {t.toolbar.button}
            </PmButton>
          }
        >
          <AskPanel onCited={() => setOpen(false)} />
          <PmButton small className="pm-assistant-popover__close" onClick={() => setOpen(false)}>
            {t.panel.close}
          </PmButton>
        </PmPopover>
      )}
    </span>
  )
}
