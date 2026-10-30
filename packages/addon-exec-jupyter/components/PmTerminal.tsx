import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useMessages, useService } from '@lincyaw/host'
import { errorMessage } from '@lincyaw/kernel'
import '@xterm/xterm/css/xterm.css'
import { failureText, MESSAGES } from '../src/client/messages.ts'
import {
  DEFAULT_TERMINAL_ROWS,
  JUPYTER_TERMINALS,
} from '../src/domain/index.ts'
import type { TerminalSession } from '../src/domain/index.ts'
import './PmTerminal.css'
export default function PmTerminal({
  env,
  rows = DEFAULT_TERMINAL_ROWS,
}: {
  env: string
  rows?: number
}) {
  const terminals = useService(JUPYTER_TERMINALS),
    t = useMessages(MESSAGES)
  const screen = useRef<HTMLDivElement>(null),
    session = useRef<TerminalSession>(),
    dispose = useRef<() => void>(),
    generation = useRef(0)
  const [state, setState] = useState<
      'idle' | 'connecting' | 'open' | 'closed' | 'failed'
    >('idle'),
    [failure, setFailure] = useState<string>()
  const unavailable = terminals?.unavailable(env)
  function close() {
    generation.current++
    void session.current?.close()
    session.current = undefined
    dispose.current?.()
    dispose.current = undefined
  }
  useEffect(() => close, [env])
  async function open() {
    if (
      !terminals ||
      !screen.current ||
      state === 'connecting' ||
      state === 'open'
    )
      return
    close()
    const revision = generation.current
    flushSync(() => {
      setState('connecting')
      setFailure(undefined)
    })
    try {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
      ])
      if (revision !== generation.current || !screen.current) return
      const terminal = new Terminal({
          rows,
          cursorBlink: true,
          fontSize: 14,
          convertEol: false,
        }),
        fit = new FitAddon()
      terminal.loadAddon(fit)
      terminal.open(screen.current)
      const resize = () => {
        const columns = fit.proposeDimensions()?.cols
        if (columns && columns !== terminal.cols) terminal.resize(columns, rows)
        session.current?.resize(rows, terminal.cols)
      }
      resize()
      const observer = new ResizeObserver(resize)
      observer.observe(screen.current)
      dispose.current = () => {
        observer.disconnect()
        terminal.dispose()
      }
      const opened = await terminals.openTerminal(env, {
        output: (data) => terminal.write(data),
        closed: () => {
          if (revision === generation.current) setState('closed')
        },
      })
      if (revision !== generation.current) {
        void opened.close()
        return
      }
      session.current = opened
      terminal.onData((data) => session.current?.send(data))
      opened.resize(rows, terminal.cols)
      setState('open')
      terminal.focus()
    } catch (error) {
      if (revision !== generation.current) return
      close()
      const code = (error as { code?: unknown } | undefined)?.code
      setFailure(failureText(errorMessage(error), typeof code === 'string' ? code : undefined))
      setState('failed')
    }
  }
  return (
    <div
      className="pm-terminal"
      data-env={env}
      data-state={unavailable ? 'unavailable' : state}
    >
      <div className="pm-terminal__bar">
        <span className="pm-terminal__title">{t.terminal(env)}</span>
        {!unavailable && ['idle', 'closed', 'failed'].includes(state) && (
          <button
            type="button"
            className="pm-terminal__open pm-ui-button pm-ui-button--small"
            disabled={!terminals}
            onClick={() => void open()}
          >
            {state === 'idle' ? t.terminalOpen : t.terminalReconnect}
          </button>
        )}
        {state === 'connecting' && (
          <span className="pm-terminal__status">{t.terminalConnecting}</span>
        )}
        {state === 'closed' && (
          <span className="pm-terminal__status">{t.terminalClosed}</span>
        )}
      </div>
      {unavailable ? (
        <p className="pm-terminal__note">{unavailable}</p>
      ) : failure ? (
        <p className="pm-terminal__note" role="alert">
          {t.terminalFailed(failure)}
        </p>
      ) : null}
      <div
        hidden={
          !!unavailable || !['connecting', 'open', 'closed'].includes(state)
        }
        ref={screen}
        className="pm-terminal__screen"
        aria-label={t.terminal(env)}
      />
    </div>
  )
}
