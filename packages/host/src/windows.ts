type Message = { join: true } | { value: unknown }

export interface WindowChannel {
  send(value: unknown): void
  close(): void
}

function deckChannel(name: string): string {
  return `${name} @ ${import.meta.env?.BASE_URL ?? '/'}`
}

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
