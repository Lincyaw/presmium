import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { deckLocale, isRecord } from '@lincyaw/kernel'
import type { ApprovalKind } from '@lincyaw/kernel'
import { MCP_MESSAGES } from './messages.ts'

export interface ListedTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  kind: 'read' | ApprovalKind
  approval?: 'ask' | 'allow'
}

export interface CalledTool {
  isError: boolean
  text: string
}

export interface PresmiumMcpClient {
  tools(): Promise<ListedTool[]>
  call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<CalledTool>
  read(uri: string): Promise<unknown>
  close(): Promise<void>
}

const KINDS = new Set(['read', 'operate', 'spend', 'write', 'agent'])
const CALL_TIMEOUT_MS = 10 * 60_000

export async function connectPresmiumMcp(url: string, token: string, name = 'presmium-dsh'): Promise<PresmiumMcpClient> {
  const client = new Client({ name, version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
  return {
    async tools() {
      const listed: ListedTool[] = []
      let cursor: string | undefined
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined)
        for (const tool of page.tools) {
          const meta = isRecord(tool._meta) ? tool._meta : {}
          const kind = typeof meta['presmium/kind'] === 'string' && KINDS.has(meta['presmium/kind']) ? meta['presmium/kind'] as ListedTool['kind'] : (tool.annotations?.readOnlyHint ? 'read' : 'operate')
          const approval = meta['presmium/approval'] === 'allow' ? 'allow' : meta['presmium/approval'] === 'ask' ? 'ask' : undefined
          listed.push({ name: tool.name, description: tool.description ?? tool.name, inputSchema: tool.inputSchema as Record<string, unknown>, kind, ...approval ? { approval } : {} })
        }
        cursor = page.nextCursor
      } while (cursor)
      return listed
    },
    async call(tool, args, signal) {
      const result = await client.callTool({ name: tool, arguments: args }, { signal, timeout: CALL_TIMEOUT_MS })
      const content = Array.isArray(result.content) ? result.content as { type: string, text?: string }[] : []
      return { isError: result.isError === true, text: content.map(part => part.text ?? '').join('\n') }
    },
    async read(uri) {
      const { contents } = await client.readResource({ uri })
      const text = (contents[0] as { text?: string } | undefined)?.text ?? ''
      try {
        return JSON.parse(text) as unknown
      } catch {
        return text
      }
    },
    close: () => client.close(),
  }
}

export function describeOperation(tool: string, args: Record<string, unknown>, lang?: string): string {
  const m = MCP_MESSAGES[deckLocale(lang)]
  const text = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '')
  switch (tool) {
    case 'navigate': return m.navigate(text(args.section), typeof args.step === 'number' ? args.step : 0)
    case 'run_code': return m.run(text(args.section), text(args.block))
    case 'build': return m.build(Array.isArray(args.to) && args.to.length ? args.to.join(', ') : m.allRenderers)
    case 'classroom_start': return m.classroomStart(text(args.name))
    case 'classroom_end': return m.classroomEnd
    default: return m.tool(tool)
  }
}
