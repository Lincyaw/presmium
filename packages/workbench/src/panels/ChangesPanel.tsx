import { useState } from 'react'
import type { FormEvent } from 'react'
import { PmBadge, PmButton, PmDialog, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'

function Counts({ added, removed }: { added?: number, removed?: number }) {
  return (
    <span className="pmw-changes__counts">
      {added !== undefined && <span data-sign="added">+{added}</span>}
      {removed !== undefined && <span data-sign="removed">−{removed}</span>}
    </span>
  )
}

export function ChangesPanel() {
  const t = useMessages()
  const workbench = useWorkbench()
  const locale = useWorkbenchState(state => state.locale)
  const review = useWorkbenchState(state => state.review)
  const uncommitted = useWorkbenchState(state => state.uncommitted)
  const revisions = useWorkbenchState(state => state.revisions)
  const failure = useWorkbenchState(state => state.changesFailure)
  const dir = useWorkbenchState(state => state.document)
  const short = (path: string) => (dir && path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : path)
  const [reviewMessage, setReviewMessage] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [discarding, setDiscarding] = useState(false)
  const pending = new Set(review?.changes.map(change => change.path))
  const own = uncommitted?.filter(file => !pending.has(file.path))
  const submit = (work: () => Promise<boolean>, done: () => void) => async (event: FormEvent) => {
    event.preventDefault()
    if (await work()) done()
  }
  return (
    <section className="pmw-changes" aria-label={t.changes}>
      {failure && <PmNotice tone="danger">{t.changesFailed(failure)}</PmNotice>}
      {review && (
        <section className="pmw-changes__group" aria-label={t.review} data-group="review">
          <h2 className="pmw-changes__head">{t.review}<PmBadge tone="accent">{review.changes.length}</PmBadge></h2>
          <p className="pmw-muted">{review.running ? t.reviewRunning : t.reviewWaiting(review.changes.length)}</p>
          <ul className="pmw-changes__list">
            {review.changes.map(change => (
              <li key={change.path} className="pmw-changes__file">
                <details>
                  <summary><span className="pmw-changes__path" data-kind={change.kind} title={change.path}>{short(change.path)}</span><Counts added={change.added} removed={change.removed} /></summary>
                  {change.diff && <pre className="pmw-changes__diff">{change.diff}</pre>}
                </details>
                <PmIconButton icon="undo" small label={t.rejectFile(short(change.path))} disabled={review.running} onClick={() => void workbench.rejectReview([change.path])} />
              </li>
            ))}
          </ul>
          {review.steps.length > 1 && (
            <details className="pmw-changes__steps">
              <summary>{t.checkpoints}</summary>
              <ol>
                {review.steps.map(step => (
                  <li key={step.id}>
                    <span>{step.label}</span>
                    <PmButton small disabled={review.running} onClick={() => void workbench.restoreReview(step.id)}>{t.restore}</PmButton>
                  </li>
                ))}
              </ol>
            </details>
          )}
          <form className="pmw-changes__form" onSubmit={submit(() => workbench.acceptReview(reviewMessage.trim() || undefined), () => setReviewMessage(''))}>
            <input className="pm-ui-input" aria-label={t.optionalMessage} placeholder={t.optionalMessage} value={reviewMessage} onChange={event => setReviewMessage(event.target.value)} />
            <PmButton type="submit" variant="primary" icon="check" disabled={review.running}>{t.accept}</PmButton>
            <PmButton variant="danger" disabled={review.running} onClick={() => void workbench.rejectReview()}>{t.rejectAll}</PmButton>
          </form>
        </section>
      )}
      <section className="pmw-changes__group" aria-label={t.uncommittedFiles} data-group="uncommitted">
        <h2 className="pmw-changes__head">{t.uncommittedFiles}{own?.length ? <PmBadge>{own.length}</PmBadge> : null}</h2>
        {own?.length === 0 && <p className="pmw-muted">{t.noUncommitted}</p>}
        {own && own.length > 0 && (
          <>
            <ul className="pmw-changes__list">
              {own.map(file => (
                <li key={file.path} className="pmw-changes__file">
                  <span className="pmw-changes__path" data-kind={file.kind} title={file.path}>{short(file.path)}</span>
                  <Counts added={file.added} removed={file.removed} />
                </li>
              ))}
            </ul>
            <form className="pmw-changes__form" onSubmit={submit(() => workbench.commitChanges(commitMessage.trim()), () => setCommitMessage(''))}>
              <input className="pm-ui-input" required aria-label={t.commitMessage} placeholder={t.commitMessage} value={commitMessage} onChange={event => setCommitMessage(event.target.value)} />
              <PmButton type="submit" variant="primary" disabled={Boolean(review)}>{t.commit}</PmButton>
              <PmButton disabled={Boolean(review)} onClick={() => setDiscarding(true)}>{t.discard}</PmButton>
            </form>
          </>
        )}
      </section>
      <section className="pmw-changes__group" aria-label={t.history} data-group="history">
        <h2 className="pmw-changes__head">{t.history}</h2>
        {revisions?.length === 0 && <p className="pmw-muted">{t.noHistory}</p>}
        <ol className="pmw-changes__list">
          {revisions?.map(revision => (
            <li key={revision.id} className="pmw-changes__revision" data-revision={revision.id}>
              <span className="pmw-changes__subject">{revision.message.split('\n')[0]}</span>
              <span className="pmw-muted pmw-changes__meta">
                <PmBadge>{t.origins[revision.origin.kind] ?? revision.origin.kind}</PmBadge>
                {revision.author.replace(/\s*<[^>]*>$/, '')} · {new Date(revision.date).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              {revision.revertedBy
                ? <span className="pmw-muted">{t.reverted}</span>
                : <PmButton small icon="undo" onClick={() => void workbench.revertRevision(revision.id)}>{t.revert}</PmButton>}
            </li>
          ))}
        </ol>
      </section>
      <PmDialog open={discarding} label={t.discard} closeLabel={t.close} onClose={() => setDiscarding(false)}>
        <p>{t.confirmDiscard}</p>
        <div className="pmw-operation__actions">
          <PmButton onClick={() => setDiscarding(false)}>{t.cancel}</PmButton>
          <PmButton
            variant="danger"
            onClick={() => {
              setDiscarding(false)
              void workbench.discardChanges()
            }}
          >
            {t.discard}
          </PmButton>
        </div>
      </PmDialog>
    </section>
  )
}
