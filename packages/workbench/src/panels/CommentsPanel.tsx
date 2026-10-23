import { useState } from 'react'
import { PmBadge, PmButton, PmEmpty, PmIconButton } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { timeAgo } from '../messages.ts'

/** The document's comments: where each is, what it says; each can go to the AI, be resolved or deleted. */
export function CommentsPanel({ onClose }: { onClose(): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const comments = useWorkbenchState(state => state.comments)
  const sections = useWorkbenchState(state => state.ir?.doc.sections)
  const locale = useWorkbenchState(state => state.locale)
  const asking = useWorkbenchState(state => state.isAsking)
  const [showResolved, setShowResolved] = useState(false)
  // Numbered as the document's pins are: the unresolved comments on a block, in order.
  const numbers = new Map(comments.filter(comment => comment.status !== 'resolved' && comment.block).map((comment, i) => [comment.id, i + 1]))
  const shown = comments.filter(comment => showResolved || comment.status !== 'resolved')
  const open = comments.filter(comment => comment.status === 'open').length
  return (
    <section className="pmw-pane" aria-labelledby="pmw-comments-title">
      <header className="pmw-pane__header">
        <h2 id="pmw-comments-title" className="pmw-pane__title">{t.comments}</h2>
        {open > 0 && <PmButton small variant="accent" icon="sparkle" disabled={asking} onClick={() => void workbench.askAgentAboutComments()}>{t.askAboutAll}</PmButton>}
        <PmIconButton small icon="close" label={t.close} onClick={onClose} />
      </header>
      {shown.length === 0
        ? <PmEmpty icon="comment">{t.noComments}</PmEmpty>
        : (
            <ol className="pmw-comments">
              {shown.map((comment) => {
                const section = sections?.find(s => s.id === comment.section)?.title ?? comment.section
                const number = numbers.get(comment.id)
                return (
                  <li key={comment.id} className="pmw-comment" data-status={comment.status}>
                    <button type="button" className="pmw-comment__place" onClick={() => workbench.revealPlace(comment.section, comment.block)}>
                      {number !== undefined && <span className="pmw-comment__number" aria-hidden="true">{number}</span>}
                      <span>{t.inSection(section)}</span>
                    </button>
                    {comment.quote && <blockquote className="pmw-comment__quote">{comment.quote}</blockquote>}
                    <p className="pmw-comment__text">{comment.text}</p>
                    <div className="pmw-comment__meta">
                      <span>{timeAgo(comment.at, locale)}</span>
                      {comment.status === 'sent' && <PmBadge tone="accent">{t.sentToAi}</PmBadge>}
                      {comment.status === 'resolved' && <PmBadge tone="ok">{t.resolved}</PmBadge>}
                    </div>
                    <div className="pmw-comment__actions">
                      {comment.status === 'open' && <PmButton small icon="sparkle" disabled={asking} onClick={() => void workbench.askAgentAboutComments([comment.id])}>{t.askAboutComment}</PmButton>}
                      {comment.status === 'resolved'
                        ? <PmButton small onClick={() => workbench.setCommentStatus(comment.id, 'open')}>{t.reopen}</PmButton>
                        : <PmButton small icon="resolved" onClick={() => workbench.setCommentStatus(comment.id, 'resolved')}>{t.resolve}</PmButton>}
                      <PmIconButton small icon="trash" label={t.deleteComment} onClick={() => workbench.removeComment(comment.id)} />
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
      {comments.some(comment => comment.status === 'resolved') && (
        <label className="pm-ui-field pm-ui-field--inline pmw-pane__footer">
          <input type="checkbox" className="pm-ui-checkbox" checked={showResolved} onChange={event => setShowResolved(event.target.checked)} />
          <span className="pm-ui-field__label">{t.showResolved}</span>
        </label>
      )}
    </section>
  )
}
