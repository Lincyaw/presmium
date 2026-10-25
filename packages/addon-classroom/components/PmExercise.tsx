import { Fragment, useState, useRef, useEffect, useMemo, useId } from 'react'
import type { ReactNode } from 'react'
import { PmIcon, useMessages, usePresentationMode, useService } from '@lincyaw/host'
import { EXECUTOR } from '@lincyaw/kernel'
import { useClassroomStore, useCollection, useParticipation } from '../src/client/composables.ts'
import {
  checkReport,
  checkRequest,
  COLLECTIONS,
  exerciseTally,
  exerciseTallyText,
  MESSAGES,
  placeKey,
  reportKinds,
  submissionId,
  toSubmission,
} from '../src/domain/index.ts'
import type { CheckError, CheckReport, Place, Submission } from '../src/domain/index.ts'
import '../src/client/style.css'
import './PmExercise.css'
export default function PmExercise(props: {
  lang?: string
  starter?: string
  checks?: string
  timeout?: number
  place?: Place
  children?: ReactNode
  className?: string
  onDone?(): void
  onCited?(): void
}) {
  const executor = useService(EXECUTOR)
  const rows = usePresentationMode() === 'slides' ? 8 : 12
  const t = useMessages(MESSAGES)
  const { me, status, joined, presenter } = useParticipation()
  const store = useClassroomStore()
  const submissions = useCollection(() => store, COLLECTIONS.submissions, toSubmission)

  const id = props.place ? placeKey(props.place) : ''
  const [code, setCode] = useState(props.starter ?? '')
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<CheckReport>()
  const [ranBy, setRanBy] = useState('')
  const tally = exerciseTally(submissions.map((item) => item.value).filter((s) => s.exerciseId === id))
  const ended = joined && !presenter && status !== 'active'

  const verdict = (() => {
    const r = report
    const { exercise } = t
    if (!r) return ''
    if (r.status === 'passed') return exercise.passed(r.passed, r.total)
    if (r.status === 'failed') return exercise.failed(r.total - r.passed, r.total)
    return exercise.notRun(r.error?.kind ?? '')
  })()

  const describe = (error: CheckError) => t.exercise.error(error.hint, error.type, error.message, error.line)

  async function submit(): Promise<void> {
    if (!executor || running) return
    setRunning(true)
    try {
      const run = await executor.run(checkRequest(code, props.checks ?? '', props.timeout))
      const result = checkReport(run, t)
      setReport(result)
      setRanBy(run.executorId)
      const participant = me
      if (store && participant && !presenter && status === 'active' && props.place) {
        store.put<Submission>(COLLECTIONS.submissions, submissionId(id, participant.id), {
          ...props.place,
          exerciseId: id,
          participant: participant.id,
          name: participant.name,
          status: result.status,
          passed: result.passed,
          total: result.total,
          kinds: reportKinds(result),
          at: Date.now(),
        })
      }
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <div
        className="pm-exercise pm-classroom-card"
        data-exercise={id}
        data-status={running ? 'running' : (report?.status ?? 'idle')}
      >
        <div className="pm-exercise__prompt">{props.children}</div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <textarea
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="pm-exercise__code pm-ui-textarea"
            aria-label={t.exercise.code}
            spellCheck={false}
            autoComplete="off"
            rows={Math.min(rows, code.split('\n').length + 1)}
            onKeyDown={(event) => {
              event.stopPropagation()
            }}
          ></textarea>
          <details className="pm-exercise__checks">
            <summary>{t.exercise.checks}</summary>
            <pre>{props.checks ?? ''}</pre>
          </details>
          <p className="pm-classroom-actions">
            <button
              type="submit"
              className="pm-ui-button pm-ui-button--primary pm-ui-button--small"
              disabled={running || !executor}
            >
              {running ? t.exercise.checking : t.exercise.submit}
            </button>
            {!executor ? <span className="pm-classroom-error">{t.exercise.noExecutor}</span> : null}
          </p>
          {ended ? <p className="pm-classroom-status pm-exercise__ended">{t.exercise.ended}</p> : null}
        </form>
        {report ? (
          <div className="pm-exercise__report" data-executor={ranBy}>
            <p className="pm-exercise__verdict" role="status" data-status={report.status}>
              {verdict}
            </p>
            {report.error ? (
              <p className="pm-exercise__error" data-kind={report.error.kind}>
                <strong>{report.error.kind}</strong>
                {t.colon}
                {describe(report.error)}
              </p>
            ) : null}
            <ol className="pm-exercise__cases">
              {report.cases.map((item) => (
                <li key={item.line} data-ok={item.ok}>
                  <PmIcon
                    className="pm-exercise__mark"
                    name={item.ok ? 'check' : 'close'}
                    strokeWidth={2.2}
                  ></PmIcon>
                  <code>{item.code}</code>
                  {item.error ? (
                    <p className="pm-exercise__error" data-kind={item.error.kind}>
                      <strong>{item.error.kind}</strong>
                      {t.colon}
                      {describe(item.error)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            {report.output.trim() ? <pre className="pm-exercise__output">{report.output}</pre> : null}
          </div>
        ) : null}
        {presenter ? <p className="pm-exercise__summary">{exerciseTallyText(tally, t)}</p> : null}
      </div>
    </>
  )
}
