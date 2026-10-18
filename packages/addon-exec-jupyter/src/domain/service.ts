import { defineService } from '@presmium/kernel'

export interface TerminalSession {
  send(data: string): void
  resize(rows: number, columns: number): void
  close(): Promise<void>
  abandon(): void
}

export interface TerminalEvents {
  output(data: string): void
  closed(): void
}

export interface JupyterEnvironments {
  unavailable(name: string): string | undefined
  openTerminal(name: string, events: TerminalEvents): Promise<TerminalSession>
}

export const JUPYTER_ENVIRONMENTS = defineService<JupyterEnvironments>('presmium.execJupyter.environments')
