import { useCallback, useEffect, useRef, useState } from 'react'
import { joinWindows } from './windows.ts'
import type { WindowChannel } from './windows.ts'

type Message = { state: unknown } | { command: string }

const isMessage = (value: unknown): value is Message => typeof value === 'object' && value !== null && ('state' in value || typeof (value as { command?: unknown }).command === 'string')

/**
 * A control of the audience's window that another window of the same presentation drives (the presenter view): the
 * audience tells the control's state (`undefined` while it offers none) through the windows' channel and runs the
 * commands it receives. A window that joins later is told the current state.
 */
export function useAudienceControl<S>(name: string, state: S | undefined, run: (command: string) => void): void {
  const latest = useRef({ state, run })
  latest.current = { state, run }
  const channel = useRef<WindowChannel | undefined>(undefined)
  useEffect(() => {
    const windows = joinWindows(name, value => {
      if (isMessage(value) && 'command' in value && latest.current.state !== undefined) latest.current.run(value.command)
    }, () => ({ state: latest.current.state ?? null }))
    channel.current = windows
    return () => {
      windows?.send({ state: null })
      windows?.close()
      channel.current = undefined
    }
  }, [name])
  const shown = JSON.stringify(state ?? null)
  useEffect(() => { channel.current?.send({ state: state ?? null }) }, [name, shown])
}

/** The other side of `useAudienceControl`: the state the audience tells, and the way to send it a command. */
export function useAudienceRemote<S>(name: string): [S | undefined, (command: string) => void] {
  const [state, setState] = useState<S | undefined>(undefined)
  const channel = useRef<WindowChannel | undefined>(undefined)
  useEffect(() => {
    const windows = joinWindows(name, value => {
      if (isMessage(value) && 'state' in value) setState((value.state ?? undefined) as S | undefined)
    }, () => undefined)
    channel.current = windows
    return () => {
      windows?.close()
      channel.current = undefined
      setState(undefined)
    }
  }, [name])
  const send = useCallback((command: string) => { channel.current?.send({ command }) }, [])
  return [state, send]
}
