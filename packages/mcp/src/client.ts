import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { deckLocale, errorMessage, isRecord } from '@lincyaw/kernel'
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
  subscribe(uri: string, changed: () => void): Promise<() => Promise<void>>
  close(): Promise<void>
}

const KINDS = new Set(['read', 'operate', 'spend', 'write', 'agent'])
const CALL_TIMEOUT_MS = 10 * 60_000

export async function connectPresmiumMcp(url: string, token: string, name = 'presmium-dsh'): Promise<PresmiumMcpClient> {
  const client = new Client({ name, version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
  type Subscription = Awaited<ReturnType<Client['listen']>>
  interface SubscriptionEntry {
    uri: string
    listeners: Set<() => void>
    controller: AbortController
    subscription?: Subscription
    opening?: Promise<void>
    queued: boolean
  }
  const subscriptions = new Map<string, SubscriptionEntry>()
  let closed = false
  const active = (entry: SubscriptionEntry) => !closed && subscriptions.get(entry.uri) === entry && entry.listeners.size > 0
  const changed = (entry: SubscriptionEntry) => {
    if (!active(entry) || entry.queued) return
    entry.queued = true
    queueMicrotask(() => {
      entry.queued = false
      if (active(entry)) for (const listener of entry.listeners) listener()
    })
  }
  const open = (entry: SubscriptionEntry): Promise<void> => {
    if (entry.subscription) return Promise.resolve()
    if (entry.opening) return entry.opening
    const opening = client.listen({ resourceSubscriptions: [entry.uri] }, { signal: entry.controller.signal }).then(async (subscription) => {
      if (!active(entry)) {
        await subscription.close()
        return
      }
      entry.subscription = subscription
      void subscription.closed.then(async (reason) => {
        if (entry.subscription !== subscription) return
        entry.subscription = undefined
        if (reason === 'local' || !active(entry)) return
        changed(entry)
        if (reason !== 'remote') return
        await entry.opening
        if (!active(entry)) return
        try {
          await open(entry)
          changed(entry)
        } catch (error) {
          if (!active(entry)) return
          console.error(`[presmium] the resource subscription to ${entry.uri} did not reconnect: ${errorMessage(error)}`)
          changed(entry)
        }
      })
    }).finally(() => {
      if (entry.opening === opening) entry.opening = undefined
    })
    entry.opening = opening
    return opening
  }
  client.setNotificationHandler('notifications/resources/updated', (notification) => {
    const entry = subscriptions.get(notification.params.uri)
    if (entry) changed(entry)
  })
  client.onclose = () => { for (const entry of subscriptions.values()) changed(entry) }
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
    async subscribe(uri, onChanged) {
      if (closed) throw new Error('the MCP client is closed')
      if (client.getProtocolEra() !== 'modern') throw new Error('live resource subscriptions need MCP 2026-07-28 or later')
      if (!client.getServerCapabilities()?.resources?.subscribe) throw new Error('this MCP server does not offer resource subscriptions')
      let entry = subscriptions.get(uri)
      if (!entry) {
        entry = { uri, listeners: new Set(), controller: new AbortController(), queued: false }
        subscriptions.set(uri, entry)
      }
      const own = entry
      const listener = () => onChanged()
      own.listeners.add(listener)
      const stop = async () => {
        own.listeners.delete(listener)
        if (own.listeners.size > 0 || subscriptions.get(uri) !== own) return
        subscriptions.delete(uri)
        own.controller.abort()
        await own.subscription?.close()
      }
      try {
        await open(own)
      } catch (error) {
        await stop()
        throw error
      }
      return stop
    },
    async close() {
      closed = true
      const entries = [...subscriptions.values()]
      subscriptions.clear()
      for (const entry of entries) entry.controller.abort()
      try {
        await Promise.all(entries.map(entry => entry.subscription?.close()))
      } finally {
        await client.close()
      }
    },
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
