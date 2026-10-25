import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import {
  PmIcon,
  useMessages,
  usePresentationMode,
  useSectionConfig,
  useService,
  useStartReport,
} from '@lincyaw/host'
import { EXECUTOR, isRecord } from '@lincyaw/kernel'
import {
  languageName,
  MESSAGES,
  runsInOf,
  seconds,
  useSlideSpaceBelow,
} from '../src/client/index.ts'
import {
  appendRun,
  compareRuns,
  configuredTimeout,
  defaultPair,
  EXEC_ID,
  fallbackReason,
  stringArgs,
  withRecordedFallback,
} from '../src/domain/index.ts'
import type { RunHistory, RunRecord } from '../src/domain/index.ts'
import RunOutputs from '../src/client/RunOutputs.tsx'
import './PmRunPanel.css'
interface Props {
  lang?: string
  code?: string
  params?: Record<string, unknown>
  recorded?: string
  compiledOutput?: string
  timeout?: number
  executor?: string
  session?: string
  place?: { section: string; block: string }
  children?: ReactNode
}
export default function PmRunPanel(props: Props) {
  const { lang = 'python', code = '', children } = props
  const executor = useService(EXECUTOR),
    report = useStartReport(),
    config = useSectionConfig(EXEC_ID),
    t = useMessages(MESSAGES)
  const [args, setArgs] = useState<Record<string, string>>(() =>
    stringArgs(props.params),
  )
  const [fields, setFields] = useState<Record<string, Record<string, string>>>(
    () =>
      Object.fromEntries(
        Object.entries(props.params ?? {})
          .filter(([, v]) => isRecord(v))
          .map(([name, v]) => [name, stringArgs(v as Record<string, unknown>)]),
      ),
  )
  const presenting = usePresentationMode() === 'slides',
    root = useRef<HTMLDivElement>(null)
  const [space, setSpace] = useState<{ panel: number; code: number }>()
  useSlideSpaceBelow(root, presenting, (panel) => {
    const main = root.current?.querySelector<HTMLElement>(
        '.pm-run-panel__main',
      ),
      pre = main?.querySelector<HTMLElement>('.pm-run-panel__source pre')
    if (main && pre) {
      const code = panel - (main.offsetHeight - pre.offsetHeight)
      setSpace((old) =>
        old?.panel === panel && old.code === code ? old : { panel, code },
      )
    }
  })
  const [history, setHistory] = useState<RunHistory>([]),
    [running, setRunning] = useState(false),
    [resetting, setResetting] = useState(false),
    [selected, setSelected] = useState<number[]>([]),
    [failure, setFailure] = useState<string>()
  const current = useRef<AbortController>()
  useEffect(() => () => current.current?.abort(), [])
  const executors = executor?.list() ?? [],
    routed = props.executor
      ? executors.find((e) => e.id === props.executor)
      : executors.find((e) => e.supports(lang))
  const display = routed?.params?.(lang),
    latest = history.at(-1)
  const executionId = latest?.result.executorId ?? props.executor ?? routed?.id
  const where = runsInOf(
    executionId,
    executionId === routed?.id
      ? routed
      : executors.find((e) => e.id === executionId),
  )
  const runsInText = where
    ? where.kind === 'browser' || where.kind === 'machine'
      ? t.runsIn[where.kind]
      : t.runsIn[where.kind](where.name)
    : undefined
  const label = (name: string) => display?.labels[name] ?? name
  const split = (name: string) =>
    Boolean(display?.fields?.includes(name) && fields[name])
  const runArgs = (): Record<string, string> =>
    Object.fromEntries(
      Object.entries(args).map(([name, v]) => [
        name,
        split(name)
          ? `{${Object.entries(fields[name]!)
              .map(
                ([key, field]) =>
                  `${JSON.stringify(key)}: ${field.trim() || 'null'}`,
              )
              .join(', ')}}`
          : v,
      ]),
    )
  const why = latest && fallbackReason(latest.result)
  const reason = why
    ? why === 'failed' &&
      latest.result.exitCode === null &&
      latest.result.stderr.trim()
      ? latest.result.stderr.trim()
      : t[why]
    : undefined
  const outputLabel =
    latest?.result.source === 'live'
      ? t.outputTook(seconds(latest.result.durationMs))
      : t.output
  const [before, after] = [...selected]
    .sort((a, b) => a - b)
    .map((id) => history.find((r) => r.id === id))
  const comparison = before && after ? compareRuns(before, after) : undefined
  async function run() {
    if (!executor || running || resetting) return
    const controller = new AbortController()
    current.current = controller
    setRunning(true)
    setFailure(undefined)
    try {
      const request = {
        lang,
        code,
        args: runArgs(),
        timeoutMs: props.timeout ?? configuredTimeout(config),
        executor: props.executor,
        session: props.session,
        place: props.place,
      }
      const result = await executor.run(request, controller.signal)
      if (controller.signal.aborted) return
      const recorded =
        props.recorded ??
        (!result.ok && result.exitCode === null
          ? props.compiledOutput
          : undefined)
      const next = appendRun(
        history,
        request.args,
        withRecordedFallback(result, recorded),
      )
      setHistory(next)
      setSelected(defaultPair(next) ?? [])
    } catch (error) {
      if (!controller.signal.aborted)
        setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      if (current.current === controller) {
        current.current = undefined
        setRunning(false)
      }
    }
  }
  async function reset() {
    if (!executor || !props.session || resetting) return
    setResetting(true)
    current.current?.abort()
    current.current = undefined
    setRunning(false)
    try {
      await executor.endSession?.(props.session)
      setHistory([])
      setSelected([])
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
    } finally {
      setResetting(false)
    }
  }
  function describe(record: RunRecord) {
    const params =
      display?.summary?.(record.args) ??
      Object.entries(record.args)
        .map(([name, v]) => `${name}=${v}`)
        .join(' ')
    return [
      params,
      record.result.source === 'recorded'
        ? t.recorded
        : record.result.ok
          ? t.succeeded
          : t.failedShort,
      `${record.result.durationMs} ms`,
    ]
      .filter(Boolean)
      .join(' · ')
  }
  const size = (value?: string) =>
    Math.min(60, Math.max(8, (value ?? '').length + 1))
  return (
    <div
      ref={root}
      className={`pm-run-panel${presenting ? ' pm-run-panel--present' : ''}`}
      style={
        space
          ? ({
              '--pm-run-panel-space': `${space.panel}px`,
              '--pm-run-code-space': `${space.code}px`,
            } as CSSProperties)
          : undefined
      }
      data-state={running ? 'running' : latest ? 'done' : 'idle'}
      data-runs={history.length}
    >
      <div className="pm-run-panel__main">
        <form
          className="pm-run-panel__bar pm-run-panel__form"
          onSubmit={(e) => {
            e.preventDefault()
            void run()
          }}
        >
          <span className="pm-run-panel__where">
            <span className="pm-run-panel__lang">{languageName(lang)}</span>
            {runsInText && ` · ${runsInText}`}
          </span>
          <span className="pm-run-panel__controls">
            {Object.keys(args).map((name) =>
              split(name) ? (
                Object.keys(fields[name]!).map((key) => (
                  <label key={`${name}.${key}`} className="pm-run-panel__param">
                    <span>
                      {label(name)} <code>{key}</code>
                    </span>
                    <input
                      className="pm-ui-input"
                      name={`${name}.${key}`}
                      value={fields[name]![key]}
                      size={size(fields[name]![key])}
                      spellCheck={false}
                      autoComplete="off"
                      onChange={(e) =>
                        setFields((old) => ({
                          ...old,
                          [name]: { ...old[name], [key]: e.target.value },
                        }))
                      }
                    />
                  </label>
                ))
              ) : (
                <label key={name} className="pm-run-panel__param">
                  <span>{label(name)}</span>
                  <input
                    className="pm-ui-input"
                    name={name}
                    value={args[name]}
                    size={size(args[name])}
                    spellCheck={false}
                    autoComplete="off"
                    onChange={(e) =>
                      setArgs((old) => ({ ...old, [name]: e.target.value }))
                    }
                  />
                </label>
              ),
            )}
            {!executor && report && (
              <span className="pm-run-panel__hint">{t.unavailable}</span>
            )}
            {props.session && (
              <button
                type="button"
                className="pm-run-panel__reset pm-ui-button"
                disabled={resetting || !executor}
                onClick={() => void reset()}
              >
                {t.resetSession}
              </button>
            )}
            <button
              type="submit"
              className="pm-run-panel__run pm-ui-button pm-ui-button--primary"
              disabled={running || resetting || !executor}
            >
              <PmIcon name="play" />
              {running ? t.running : history.length ? t.rerun : t.run}
            </button>
          </span>
        </form>
        <div className="pm-run-panel__source">
          {children ?? (
            <pre>
              <code>{code}</code>
            </pre>
          )}
        </div>
      </div>
      {(latest || history.length > 0 || failure) && (
        <div className="pm-run-panel__side">
          {failure && (
            <p role="alert" className="pm-run-panel__stderr">
              {failure}
            </p>
          )}
          {latest && (
            <div
              className="pm-run-panel__output"
              data-source={latest.result.source}
              data-ok={latest.result.ok}
            >
              <div className="pm-run-panel__label">{outputLabel}</div>
              {reason && (
                <div className="pm-run-panel__badge pm-ui-badge pm-ui-badge--warn">
                  {t.recordedBadge(reason)}
                </div>
              )}
              <RunOutputs result={latest.result} hideError={Boolean(reason)} />
            </div>
          )}
          {history.length > 0 && (
            <ol className="pm-run-panel__history">
              {history.map((record) => (
                <li key={record.id} data-run={record.id}>
                  <label>
                    <input
                      type="checkbox"
                      className="pm-ui-checkbox"
                      checked={selected.includes(record.id)}
                      onChange={() =>
                        setSelected((old) =>
                          old.includes(record.id)
                            ? old.filter((id) => id !== record.id)
                            : [...old, record.id].slice(-2),
                        )
                      }
                    />
                    #{record.id} {describe(record)}
                  </label>
                </li>
              ))}
            </ol>
          )}
          {comparison && (
            <div
              className="pm-run-panel__compare"
              data-changed={comparison.changed}
            >
              <div className="pm-run-panel__compare-title">
                {t.compare(comparison.before.id, comparison.after.id)}
              </div>
              {comparison.args.map((change) => (
                <div
                  key={change.name}
                  className="pm-run-panel__arg"
                  data-arg={change.name}
                >
                  {t.argChange(
                    label(change.name),
                    change.before ?? '—',
                    change.after ?? '—',
                  )}
                </div>
              ))}
              <pre className="pm-run-panel__diff">
                {comparison.output.map((line, i) => (
                  <span key={i} data-kind={line.kind}>
                    {{ same: ' ', added: '+', removed: '-' }[line.kind]}{' '}
                    {line.text}
                  </span>
                ))}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
