import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { errorMessage } from '@lincyaw/kernel'
import {
  PmIconButton,
  useStep,
  useStepScope,
  useMessages,
  usePresentationMode,
  useSectionConfig,
  useService,
  useStartReport,
  useViewRole,
} from '@lincyaw/host'
import { markLine, MESSAGES } from '../src/client/index.ts'
import {
  configuredTimeout,
  EXEC_ID,
  frameAt,
  stringArgs,
  TRACER,
} from '../src/domain/index.ts'
import type { Trace } from '../src/domain/index.ts'
import './PmStepRun.css'
export default function PmStepRun({
  lang = 'python',
  code = '',
  params,
  timeout,
  steps,
  children,
}: {
  lang?: string
  code?: string
  params?: Record<string, string | number | boolean>
  timeout?: number
  steps?: number
  children?: ReactNode
}) {
  const tracer = useService(TRACER),
    report = useStartReport(),
    config = useSectionConfig(EXEC_ID),
    t = useMessages(MESSAGES)
  const root = useRef<HTMLDivElement>(null),
    source = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false),
    [trace, setTrace] = useState<Trace>(),
    [local, setLocal] = useState<number>()
  const hostStep = useStep(),
    scope = useStepScope(),
    role = useViewRole()
  const expanded = !Number.isFinite(hostStep),
    lazy = usePresentationMode() === 'document'
  const count = steps ?? trace?.events.length ?? 0
  const traced = trace?.error === undefined ? trace?.events.length : undefined
  const last = traced ?? count
  const sectionStep = Math.max(0, Math.min(count, hostStep - scope.at))
  const step = expanded ? (local ?? last) : sectionStep
  const frame = trace ? frameAt(trace, step) : undefined
  const state = trace
    ? trace.error === undefined
      ? 'ready'
      : 'failed'
    : !tracer && report
      ? 'unavailable'
      : 'loading'
  const authoring = role === 'presenter' || import.meta.env.DEV
  const wanted = !lazy || near || (!expanded && sectionStep > 0)
  useEffect(() => {
    if (!lazy || !root.current || typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px 0px' },
    )
    observer.observe(root.current)
    return () => observer.disconnect()
  }, [lazy])
  const timeoutMs = timeout ?? configuredTimeout(config)
  useEffect(() => {
    if (!tracer || !wanted) return
    let disposed = false
    void tracer
      .trace({
        lang,
        code,
        args: stringArgs(params),
        timeoutMs,
      })
      .then((result) => {
        if (!disposed) setTrace(result)
      })
      .catch((error) => {
        if (!disposed)
          setTrace({ events: [], truncated: false, error: errorMessage(error) })
      })
    return () => {
      disposed = true
    }
  }, [tracer, wanted, lang, code, params, timeoutMs])
  useLayoutEffect(
    () => markLine(source.current, frame?.line, 'pm-step-run__line'),
    [frame?.line, children, code],
  )
  const go = (target: number) => setLocal(Math.max(0, Math.min(last, target)))
  return (
    <div
      ref={root}
      className="pm-step-run"
      data-state={state}
      data-steps={count}
      data-step={frame?.step}
      data-line={frame?.line}
    >
      <div ref={source} className="pm-step-run__source">
        {children ?? (
          <pre>
            <code>
              {code.split('\n').map((text, i) => (
                <span key={i}>
                  <span className="line">{text}</span>
                  {'\n'}
                </span>
              ))}
            </code>
          </pre>
        )}
      </div>
      <div className="pm-step-run__side">
        <div className="pm-step-run__status">
          {state === 'loading' ? (
            t.tracing
          ) : state === 'unavailable' ? (
            t.unavailable
          ) : state === 'failed' ? (
            t.traceFailed
          ) : (
            <>
              {t.stepOf(frame?.step ?? 0, traced ?? 0)}
              {frame?.line ? t.atLine(frame.line) : ''}
              {trace?.truncated ? t.truncated : ''}
              {authoring &&
                (steps !== undefined &&
                traced !== undefined &&
                traced !== steps ? (
                  <div className="pm-step-run__warning">
                    {t.stepsMismatch(steps, traced)}
                  </div>
                ) : steps === undefined ? (
                  <div className="pm-step-run__warning">
                    {t.stepsMissing(traced ?? 0)}
                  </div>
                ) : null)}
            </>
          )}
        </div>
        {expanded && state === 'ready' && (
          <div
            className="pm-step-run__stepper"
            role="group"
            aria-label={t.stepper}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <PmIconButton
              icon="chevron-left"
              label={t.previousStep}
              small
              disabled={(frame?.step ?? 0) <= 0}
              onClick={() => go((frame?.step ?? 0) - 1)}
            />
            <input
              type="range"
              min="0"
              max={last}
              value={frame?.step ?? 0}
              aria-label={t.stepper}
              aria-valuetext={t.stepOf(frame?.step ?? 0, last)}
              onChange={(e) => go(Number(e.target.value))}
            />
            <PmIconButton
              icon="chevron-right"
              label={t.nextStep}
              small
              disabled={(frame?.step ?? 0) >= last}
              onClick={() => go((frame?.step ?? 0) + 1)}
            />
          </div>
        )}
        <pre className="pm-step-run__output">
          {trace?.error ?? frame?.output}
        </pre>
      </div>
    </div>
  )
}
