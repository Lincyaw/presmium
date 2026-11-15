import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join } from 'node:path'
import { isRecord, jsonResponse, problemResponse } from '@lincyaw/kernel'
import type { McpConnectionSettings, McpConnectionChange, Route } from '@lincyaw/kernel'
import type { PresmiumServer } from '@lincyaw/server'

/** A separate MCP listener never changes the editor's address or takes over the stdio host. */
export async function createMcpSettings(options: { root: string, stateFile: string, server: PresmiumServer, command?: string }) {
  const file = join(options.root, '.presmium', 'mcp-settings.json')
  let preference: { transport: 'stdio' | 'http', port: number } = { transport: 'stdio', port: 0 }
  try {
    const saved: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (validPreference(saved)) preference = { transport: saved.transport, port: saved.port }
  } catch { /* A missing or invalid preference leaves the default stdio connection usable. */ }
  let listener: Awaited<ReturnType<PresmiumServer['listenMcp']>> | undefined
  let issue: 'mcp-port-unavailable' | undefined
  if (preference.transport === 'http') {
    try { listener = await options.server.listenMcp(preference.port) } catch { issue = 'mcp-port-unavailable' }
  }
  const command = options.command ?? process.argv[1]
  const stdio = command && isAbsolute(command) && basename(command) === 'presmium.mjs' && existsSync(command)
    ? { command: process.execPath, args: [command, 'mcp', options.root] } : undefined
  const revision = () => createHash('sha256').update(JSON.stringify(preference)).digest('hex')
  const read = (): McpConnectionSettings => ({ ...preference, revision: revision(), root: options.root,
    ...(stdio ? { stdio } : {}), ...(listener ? { url: listener.url } : {}), ...(issue ? { issue } : {}), stateFile: options.stateFile })
  let queue = Promise.resolve()
  const change = (body: McpConnectionChange) => {
    const result = queue.then(async () => {
      if (body.revision !== revision()) throw new Error('mcp-settings-conflict')
      const next = body.transport === 'http' && (body.port !== preference.port || !listener) ? await options.server.listenMcp(body.port).catch(() => { throw new Error('mcp-port-unavailable') }) : body.transport === 'http' ? listener : undefined
      try {
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(`${file}.tmp`, JSON.stringify({ transport: body.transport, port: body.port }) + '\n', { mode: 0o600 })
        renameSync(`${file}.tmp`, file)
      } catch (error) { if (next !== listener) await next?.close(); throw error }
      const previous = listener
      preference = { transport: body.transport, port: body.port }; listener = next; issue = undefined
      if (previous !== listener) await previous?.close()
      return read()
    })
    queue = result.then(() => {}, () => {})
    return result
  }
  const route: Route = { role: 'owner', maxBody: 8192, handle: async request => {
    try {
      if (request.method === 'GET') return jsonResponse(read(), 200, { 'cache-control': 'no-store' })
      if (request.method !== 'POST') return problemResponse(405, 'GET or POST')
      const body: unknown = await request.json().catch(() => undefined)
      if (isRecord(body) && body.action === 'export' && typeof body.revision === 'string' && Object.keys(body).length === 2) {
        await queue
        if (body.revision !== revision()) return problemResponse(409, 'mcp-settings-conflict')
        const connection = preference.transport === 'stdio' ? stdio : listener ? { url: listener.url, headers: { Authorization: `Bearer ${options.server.mcpToken}` } } : undefined
        if (!connection) return problemResponse(409, 'mcp-connection-unavailable')
        return jsonResponse({ mcpServers: { presmium: connection } }, 200, { 'cache-control': 'no-store' })
      }
      if (!validPreference(body) || typeof body.revision !== 'string' || Object.keys(body).some(key => !['revision', 'transport', 'port'].includes(key))) return problemResponse(400, 'mcp-settings-invalid')
      return jsonResponse(await change(body as unknown as McpConnectionChange), 200, { 'cache-control': 'no-store' })
    } catch (error) {
      const code = error instanceof Error && ['mcp-settings-conflict', 'mcp-port-unavailable'].includes(error.message) ? error.message : 'mcp-settings-unavailable'
      return problemResponse(code === 'mcp-settings-unavailable' ? 503 : 409, code)
    }
  } }
  return { route }
}
function validPreference(value: unknown): value is { transport: 'stdio' | 'http', port: number, revision?: unknown } {
  return isRecord(value) && ['stdio', 'http'].includes(String(value.transport)) && typeof value.port === 'number' && Number.isInteger(value.port) && value.port >= 0 && value.port <= 65535
}
