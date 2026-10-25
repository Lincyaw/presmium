import { useState } from 'react'
import { PmButton, PmPopover, useMessages } from '@lincyaw/host'
import { COLLECTIONS, MESSAGES, toQuestion, unansweredCount } from '../domain/index.ts'
import { useClassroomStore, useCollection, useParticipation } from './composables.ts'
import ClassroomOverlays from './ClassroomOverlays.tsx'
import './style.css'
import ClassroomPanel from './ClassroomPanel.tsx'
import './ClassroomToolbar.css'
export default function ClassroomToolbar() {
  const t = useMessages(MESSAGES)
  const [open, setOpen] = useState(false)
  const { presenter } = useParticipation()
  const store = useClassroomStore()
  const questions = useCollection(() => store, COLLECTIONS.questions, toQuestion)
  const unanswered = unansweredCount(questions.map((item) => item.value))
  return (
    <span className="pm-classroom-toolbar">
      {presenter && (
        <PmPopover
          open={open}
          onOpenChange={setOpen}
          label={t.interaction}
          name="pm-classroom-popover"
          trigger={
            <PmButton variant="ghost" small title={t.toolbar.title} aria-expanded={open}>
              {t.toolbar.button}
              {unanswered > 0 && (
                <span
                  className="pm-classroom-toolbar__badge pm-ui-badge pm-ui-badge--danger pm-ui-badge--pill"
                  aria-label={t.toolbar.unanswered(unanswered)}
                >
                  {unanswered}
                </span>
              )}
            </PmButton>
          }
        >
          <ClassroomPanel />
          <PmButton small className="pm-classroom-popover__close" onClick={() => setOpen(false)}>
            {t.close}
          </PmButton>
        </PmPopover>
      )}
      <ClassroomOverlays />
    </span>
  )
}
