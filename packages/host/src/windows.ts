/**
 * The windows of a deck in this browser, for one shared state (`useSharedState`,
 * scopes 'local' and 'remote'), over a BroadcastChannel. A BroadcastChannel
 * carries only the changes made after a window has opened, so a window that
 * joins asks for the state, and the windows where it has changed answer: a
 * presenter window opened mid-talk starts from the current state.
 */
type Message = { join: true } | { value: unknown }

export interface WindowChannel {
  /** Sends a change made in this window to the others. */
  send(value: unknown): void
  close(): void
}

/**
 * Joins channel `name`: `receive` gets the values the other windows send, and
 * `known` answers a window that joins later; it returns undefined while the
 * state is still its initial value. Undefined outside a browser.
 */
export function joinWindows(name: string, receive: (value: unknown) => void, known: () => unknown): WindowChannel | undefined {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return undefined
  const channel = new BroadcastChannel(name)
  channel.onmessage = ({ data }: MessageEvent<Message>) => {
    if ('value' in data) {
      receive(data.value)
      return
    }
    const value = known()
    if (value !== undefined) channel.postMessage({ value } satisfies Message)
  }
  channel.postMessage({ join: true } satisfies Message)
  return {
    send: value => channel.postMessage({ value } satisfies Message),
    close: () => channel.close(),
  }
}
