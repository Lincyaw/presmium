import { Fragment, useState, useRef, useEffect, useMemo, useId } from 'react'
import type { ReactNode } from 'react'
import { useMessages } from '@lincyaw/host'
import { MESSAGES } from '../domain/index.ts'
import { useClassroomSession } from './composables.ts'
import { releaseFocus } from './focus.ts'
import './SessionBadge.css'
export default function SessionBadge(props: {
  children?: ReactNode
  className?: string
  onDone?(): void
  onCited?(): void
}) {
  const { session, snapshot } = useClassroomSession()
  const t = useMessages(MESSAGES)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const learner = snapshot?.me?.role === 'learner'
  const shown = Boolean(snapshot?.server && (snapshot.invitation || learner))

  async function join(): Promise<void> {
    const room = snapshot?.invitation
    if (!session || !room || busy) return
    setBusy(true)
    releaseFocus()
    await session.join(room, name).catch(() => {})
    setBusy(false)
  }

  return (
    <>
      {snapshot && shown ? (
        <div
          className={`pm-session-badge ${props.className ?? ''}`}
          role="region"
          aria-label={t.badge}
          data-status={snapshot.status}
          data-follow={snapshot.follow}
        >
          {snapshot.status === 'idle' ? (
            <form
              className="pm-session-badge__row"
              onSubmit={(event) => {
                event.preventDefault()
                join()
              }}
            >
              <span>{snapshot.error ?? t.joinRoom(snapshot.invitation ?? '')}</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="pm-ui-input"
                aria-label={t.nickname}
                placeholder={t.nickname}
                maxLength={40}
                required
              ></input>
              <button
                type="submit"
                className="pm-ui-button pm-ui-button--primary pm-ui-button--small"
                disabled={busy}
              >
                {t.join}
              </button>
            </form>
          ) : snapshot.status === 'ended' ? (
            <div className="pm-session-badge__row">
              <strong>{t.status.ended}</strong>
              <button
                type="button"
                className="pm-ui-button pm-ui-button--small"
                onClick={(event) => {
                  session?.leave()
                }}
              >
                {t.leave}
              </button>
            </div>
          ) : snapshot.connection !== 'connected' ? (
            <div className="pm-session-badge__row">{t.status.connecting}</div>
          ) : snapshot.follow === 'follow' ? (
            <div className="pm-session-badge__row">
              <span className="pm-ui-dot" aria-hidden="true"></span>
              <span>{t.followingPresenter}</span>
              <button
                type="button"
                className="pm-ui-button pm-ui-button--small"
                onClick={(event) => {
                  session?.setFollow('free')
                }}
              >
                {t.browseAlone}
              </button>
            </div>
          ) : (
            <div className="pm-session-badge__row">
              <span>{t.browsingAlone}</span>
              {snapshot.presenterCursor ? (
                <span className="pm-session-badge__presenter">
                  {t.presenterAt(snapshot.presenterCursor.slide, snapshot.presenterCursor.step)}
                </span>
              ) : null}
              <button
                type="button"
                className="pm-ui-button pm-ui-button--primary pm-ui-button--small"
                onClick={(event) => {
                  session?.setFollow('follow')
                }}
              >
                {t.backToPresenter}
              </button>
            </div>
          )}
          {snapshot.refused && snapshot.status !== 'idle' ? (
            <p className="pm-session-badge__note" role="alert">
              {t.refused}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
