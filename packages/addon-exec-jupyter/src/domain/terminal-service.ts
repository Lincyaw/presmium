import { defineService } from '@lincyaw/kernel'

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

/** Terminals of the deck's Jupyter environments, for PmTerminal. */
export interface JupyterTerminals {
  unavailable(name: string): string | undefined
  openTerminal(name: string, events: TerminalEvents): Promise<TerminalSession>
}

export const JUPYTER_TERMINALS = defineService<JupyterTerminals>('presmium.execJupyter.environments')
