import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useMessages, useService, useStartReport } from '@lincyaw/host'
import { errorMessage, languageId } from '@lincyaw/kernel'
import type { RunResult } from '@lincyaw/kernel'
import { MESSAGES } from '../src/client/messages.ts'
import { archiveName, disconnected, LOCAL_ENV } from '../src/domain/index.ts'
import type { LocalEnvStatus } from '../src/domain/index.ts'
import './PmLocalEnv.css'
export default function PmLocalEnv({
  file,
  lang = 'python',
  code = '',
  archive,
  devcontainer,
  children,
}: {
  file: string
  lang?: string
  code?: string
  archive?: string
  devcontainer?: string
  children?: ReactNode
}) {
  const env = useService(LOCAL_ENV),
    report = useStartReport(),
    t = useMessages(MESSAGES)
  const [probed, setProbed] = useState<LocalEnvStatus>(),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(''),
    [busy, setBusy] = useState<string>(),
    [output, setOutput] = useState<RunResult>(),
    [error, setError] = useState<string>()
  useEffect(() => {
    let disposed = false
    if (env)
      void env
        .status()
        .then((result) => {
          if (!disposed) setProbed(result)
        })
        .catch((e) => {
          if (!disposed) setError(errorMessage(e))
        })
    return () => {
      disposed = true
    }
  }, [env])
  const status =
    probed ?? (report && !env ? disconnected('pluginOff') : undefined)
  const connected = !!status?.connected,
    canRun = !!status?.languages.includes(languageId(lang)),
    canExport = connected ? !!status?.devcontainer : !!archive
  const missing =
    status &&
    [
      !status.docker && t.noDocker,
      !status.devcontainer && t.noDefinition,
    ].filter(Boolean)
  const notice = !status
    ? t.connecting
    : !status.connected
      ? status.reason && t[status.reason]
      : missing?.length
        ? missing.join(t.separator)
        : undefined
  const currentCode = () => {
    const text = editing ? draft : code
    return text.endsWith('\n') ? text : `${text}\n`
  }
  async function act<T>(
    name: string,
    task: (service: NonNullable<typeof env>) => Promise<T>,
  ): Promise<T | undefined> {
    if (!env || busy) return
    setBusy(name)
    setError(undefined)
    try {
      return await task(env)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(undefined)
    }
  }
  async function run() {
    const result = await act('run', (service) =>
      service.run({ lang, code: currentCode() }),
    )
    if (result) setOutput(result)
  }
  async function replicate() {
    const blob = connected
      ? await act('replicate', (service) =>
          service.replicate({ file, content: currentCode(), lang }),
        )
      : new Blob(
          [Uint8Array.from(atob(archive ?? ''), (c) => c.charCodeAt(0))],
          { type: 'application/zip' },
        )
    if (!blob) return
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = archiveName(file)
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  }
  return (
    <section
      className="pm-local-env"
      data-state={
        !status ? 'pending' : connected ? 'connected' : 'disconnected'
      }
    >
      <header className="pm-local-env__header">
        <code>{file}</code>
        {(status?.devcontainer ?? devcontainer) && (
          <span className="pm-local-env__badge pm-ui-badge">
            {t.container(status?.devcontainer ?? devcontainer ?? '')}
          </span>
        )}
      </header>
      <div className="pm-local-env__source" hidden={editing}>
        {children}
      </div>
      {editing && (
        <textarea
          className="pm-local-env__editor pm-ui-textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          aria-label={t.editFile(file)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      )}
      {(connected || archive) && (
        <div className="pm-local-env__actions">
          {connected && (
            <>
              {!editing && (
                <button
                  type="button"
                  className="pm-ui-button pm-ui-button--small"
                  data-action="edit"
                  onClick={() => {
                    setDraft(currentCode())
                    setEditing(true)
                  }}
                >
                  {t.edit}
                </button>
              )}
              <button
                type="button"
                className="pm-ui-button pm-ui-button--primary pm-ui-button--small"
                data-action="run"
                disabled={!canRun || !!busy}
                onClick={() => void run()}
              >
                {busy === 'run' ? t.running : t.runInContainer}
              </button>
            </>
          )}
          <button
            type="button"
            className="pm-ui-button pm-ui-button--small"
            data-action="replicate"
            disabled={!canExport || !!busy}
            onClick={() => void replicate()}
          >
            {t.replicate}
          </button>
        </div>
      )}
      {notice && <p className="pm-local-env__notice">{notice}</p>}
      {output && (
        <pre className="pm-local-env__output" data-ok={output.ok}>
          {output.stdout}
          {output.stderr}
          {output.timedOut ? t.timedOut : ''}
        </pre>
      )}
      {error && (
        <p className="pm-local-env__error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
