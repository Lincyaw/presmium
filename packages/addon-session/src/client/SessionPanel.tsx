import { Fragment, useState, useRef, useEffect, useMemo, useId } from 'react'
import type { ReactNode } from 'react'
import { useMessages } from '@lincyaw/host'
import { errorMessage } from '@lincyaw/kernel'
import { renderSVG } from 'uqr'
import { isLoopbackLink, MESSAGES, statusText } from '../domain/index.ts'
import { useClassroomSession } from './composables.ts'
import { releaseFocus } from './focus.ts'
import './SessionPanel.css'
export default function SessionPanel(props: {
  children?: ReactNode
  className?: string
  onDone?(): void
  onCited?(): void
}) {
  const { session, snapshot } = useClassroomSession()
  const t = useMessages(MESSAGES)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')

  const presenter = snapshot?.me?.role === 'presenter'
  const qr = snapshot?.joinUrl ? renderSVG(snapshot.joinUrl, { border: 1 }) : ''

  async function run(action: (s: NonNullable<typeof session>) => unknown): Promise<void> {
    if (!session || busy) return
    setBusy(true)
    setFailure('')
    try {
      await action(session)
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  function submit(): void {
    const room = snapshot?.invitation
    releaseFocus()
    void run((s) => (room ? s.join(room, name) : s.create(name)))
  }

  return (
    <>
      {snapshot ? (
        <div className="pm-session" data-status={snapshot.status} data-connection={snapshot.connection}>
          <p className="pm-session__status" role="status">
            {statusText(snapshot, t)}
          </p>
          {!snapshot.server ? (
            <p className="pm-session__hint">
              {t.hint.beforeCommand}
              <code>presmium-classroom-server</code>
              {t.hint.beforeKey}
              <code>presmium.session.server</code>
              {t.hint.end}
            </p>
          ) : snapshot.status === 'idle' ? (
            <>
              {snapshot.rejoin ? (
                <p className="pm-session__actions">
                  <button
                    type="button"
                    className="pm-ui-button pm-ui-button--primary pm-ui-button--small"
                    disabled={busy}
                    title={t.rejoinTitle}
                    onClick={(event) => {
                      run((s) => s.rejoin())
                    }}
                  >
                    {t.rejoin(snapshot.rejoin)}
                  </button>
                </p>
              ) : null}
              <form
                className="pm-session__form"
                onSubmit={(event) => {
                  event.preventDefault()
                  submit()
                }}
              >
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
                  {snapshot.invitation ? t.join : t.create}
                </button>
              </form>
            </>
          ) : (
            <>
              <p>
                {t.classroom}
                <code className="pm-session__room pm-ui-code">{snapshot.sessionId}</code> ·{' '}
                {snapshot.me?.name}
                {presenter ? t.role.presenter : t.role.learner}
              </p>
              {presenter && snapshot.status === 'active' && snapshot.joinUrl ? (
                <>
                  <p className="pm-session__join">
                    {t.joinLink}
                    <a
                      className="pm-session__link pm-ui-link"
                      href={snapshot.joinUrl}
                      target="_blank"
                      rel="noopener"
                    >
                      {snapshot.joinUrl}
                    </a>
                  </p>
                  {isLoopbackLink(snapshot.joinUrl) ? (
                    <p className="pm-session__warning" role="note">
                      {t.loopbackLink}
                    </p>
                  ) : null}
                  <div
                    className="pm-session__qr"
                    role="img"
                    aria-label={t.qr}
                    dangerouslySetInnerHTML={{ __html: qr }}
                  ></div>
                </>
              ) : null}
              <p className="pm-session__label pm-ui-heading">
                {t.participantCount(snapshot.participants.length)}
              </p>
              <ul className="pm-session__participants" aria-label={t.participants}>
                {snapshot.participants.map((p) => (
                  <li key={p.id} data-role={p.role}>
                    {p.name}
                    {p.role === 'presenter' ? <span>{t.role.presenter}</span> : null}
                  </li>
                ))}
              </ul>
              <p className="pm-session__actions">
                {presenter && snapshot.status === 'active' ? (
                  <button
                    type="button"
                    className="pm-ui-button pm-ui-button--danger pm-ui-button--small"
                    disabled={busy}
                    onClick={(event) => {
                      run((s) => s.end())
                    }}
                  >
                    {t.end}
                  </button>
                ) : null}
                {presenter && snapshot.status === 'ended' && !snapshot.archive ? (
                  <button
                    type="button"
                    className="pm-ui-button pm-ui-button--small"
                    disabled={busy}
                    title={t.archiveTitle}
                    onClick={(event) => {
                      run((s) => s.archive())
                    }}
                  >
                    {t.archive}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="pm-ui-button pm-ui-button--small"
                  onClick={(event) => {
                    session?.leave()
                  }}
                >
                  {t.leaveClassroom}
                </button>
              </p>
            </>
          )}
          {failure ? (
            <p className="pm-session__error" role="alert">
              {failure}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
