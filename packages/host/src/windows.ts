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
 * The name of a BroadcastChannel of this deck: `name` qualified with the base
 * URL the deck is served from (`import.meta.env.BASE_URL`; Vite builds both
 * forms). A BroadcastChannel reaches every page of the origin, so two decks
 * served from one origin, even under the same title, would otherwise share
 * their channels.
 */
export function deckChannel(name: string): string {
  // `env` is missing where no bundler replaces it, e.g. when Node loads the module.
  return `${name} @ ${import.meta.env?.BASE_URL ?? '/'}`
}

/**
 * Joins channel `name` of this deck (`deckChannel`): `receive` gets the values
 * the other windows send, and `known` answers a window that joins later; it
 * returns undefined while the state is still its initial value. Undefined
 * outside a browser.
 */
export function joinWindows(name: string, receive: (value: unknown) => void, known: () => unknown): WindowChannel | undefined {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return undefined
  const channel = new BroadcastChannel(deckChannel(name))
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
