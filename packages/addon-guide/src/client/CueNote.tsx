import { useMessages } from '@lincyaw/host'
import { GUIDE_MESSAGES } from '../domain/index.ts'
export default function CueNote({
  title,
  text,
  state,
}: {
  title?: string
  text?: string
  state?: 'shown' | 'hidden'
}) {
  const t = useMessages(GUIDE_MESSAGES)
  return state && (title || text) ? (
    <div
      className="pm-cue-note"
      data-state={state}
      style={state === 'shown' ? undefined : { visibility: 'hidden' }}
      aria-hidden={state === 'shown' ? undefined : true}
    >
      <p>
        {title && <strong>{title}</strong>}
        {title && text ? t.separator : ''}
        {text}
      </p>
    </div>
  ) : null
}
