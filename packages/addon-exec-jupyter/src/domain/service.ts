import { defineService } from '@presmium/kernel'

/** A terminal of an environment, open on the server. */
export interface TerminalSession {
  send(data: string): void
  resize(rows: number, columns: number): void
  close(): Promise<void>
}

export interface TerminalEvents {
  output(data: string): void
  /** The terminal ended (the shell exited, the server closed it). */
  closed(): void
}

/**
 * The page's remote environments (browser service of this plugin): what
 * `PmTerminal` connects with, the same connection as the environment's
 * executor (the server's proxy, or the learner's token).
 */
export interface JupyterEnvironments {
  /** Why the page cannot reach the environment, without trying (e.g. `auth: proxy` in static output); undefined when it may. */
  unavailable(name: string): string | undefined
  /** Starts a terminal on the environment's server; rejects with the reason it cannot (the learner gave no token, the server refused). */
  openTerminal(name: string, events: TerminalEvents): Promise<TerminalSession>
}

export const JUPYTER_ENVIRONMENTS = defineService<JupyterEnvironments>('presmium.execJupyter.environments')
