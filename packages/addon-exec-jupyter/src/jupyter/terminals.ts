/**
 * A terminal of a Jupyter Server (P-107), over the terminals API of
 * `@jupyterlab/services`: a new terminal on the server, its WebSocket
 * (`stdin`, `stdout`, `set_size` messages), shut down when closed, or when
 * the page goes away (`abandon`).
 */
import type { ServerConnection, Terminal } from '@jupyterlab/services'
import type { TerminalEvents, TerminalSession } from '../domain/service.ts'
import { services } from './kernels.ts'

/**
 * Starts a terminal and connects to it. The services' manager asks the page
 * whether the server offers terminals (JupyterLab's page configuration,
 * which this page has not): this client says it does, and the server's
 * answer to the start decides.
 */
export async function openTerminal(settings: ServerConnection.ISettings, events: TerminalEvents): Promise<TerminalSession> {
  const { ServerConnection, TerminalManager } = await services()
  const url = `${settings.baseUrl}api/terminals`
  const client: Terminal.ITerminalAPIClient = {
    serverSettings: settings,
    isAvailable: true,
    async startNew() {
      const response = await ServerConnection.makeRequest(url, { method: 'POST', body: '{}' }, settings)
      if (response.status !== 200) throw await ServerConnection.ResponseError.create(response)
      return await response.json() as Terminal.IModel
    },
    async listRunning() {
      const response = await ServerConnection.makeRequest(url, {}, settings)
      if (response.status !== 200) throw await ServerConnection.ResponseError.create(response)
      return await response.json() as Terminal.IModel[]
    },
    async shutdown(name) {
      const response = await ServerConnection.makeRequest(`${url}/${encodeURIComponent(name)}`, { method: 'DELETE' }, settings)
      if (response.status !== 204 && response.status !== 404) throw await ServerConnection.ResponseError.create(response)
    },
  }
  const manager = new TerminalManager({ serverSettings: settings, terminalAPIClient: client, standby: 'when-hidden' })
  const connection = await manager.startNew()
  connection.messageReceived.connect((_, message) => {
    if (message.type === 'stdout' && typeof message.content?.[0] === 'string') events.output(message.content[0])
    if (message.type === 'disconnect') events.closed()
  })
  return {
    send: data => connection.send({ type: 'stdin', content: [data] }),
    resize: (rows, columns) => {
      if (connection.connectionStatus === 'connected') connection.send({ type: 'set_size', content: [rows, columns] })
    },
    async close() {
      try {
        await connection.shutdown()
      } catch {
        // Gone already.
      }
      manager.dispose()
    },
    abandon() {
      void ServerConnection.makeRequest(`${url}/${encodeURIComponent(connection.name)}`, { method: 'DELETE', keepalive: true }, settings).catch(() => {})
      manager.dispose()
    },
  }
}
