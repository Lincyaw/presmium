import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type { CallToolResult } from '@modelcontextprotocol/client'
import { CallToolResultSchema } from '@modelcontextprotocol/core'
import { DOCUMENT_AUDIO_MAX_BYTES, DOCUMENT_IMAGE_MAX_BYTES, MEDIA_UPLOAD_PATH, APPROVAL_KINDS, deckLocale, errorMessage, isRecord } from '@lincyaw/kernel'
import type { ApprovalKind, MediaUpload, MediaUploadKind } from '@lincyaw/kernel'
import { MCP_MESSAGES } from './messages.ts'
import { TOOL_APPROVAL_META, TOOL_KIND_META, TOOL_WORKSPACE_META } from './tool-meta.ts'
import { CLONE_PREPARATION_METHOD } from './clone-protocol.ts'

export interface ListedTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  kind: 'read' | ApprovalKind
  approval?: 'ask' | 'allow'
  workspace?: 'author' | 'candidate'
}

export interface CalledImage {
  /** Base64, as MCP carries it. */
  data: string
  mimeType: string
}

export interface CalledTool {
  isError: boolean
  /** The result's text parts, joined by line breaks. */
  text: string
  /** The result's image parts, in order. */
  images: CalledImage[]
  /** The result's structured content, when the tool gives one. */
  structured?: Record<string, unknown>
}

export interface PresmiumMcpClient {
  /** Trusted host only. The native reference remains inside this closure, outside model arguments/results. */
  prepareVoiceClone(args: Record<string, unknown>, signal?: AbortSignal): Promise<PreparedMcpCall>
  /** Transfer selected client-local bytes outside tool/model content; import its returned upload through the existing media tool. */
  uploadMedia(document: string, kind: MediaUploadKind, file: File, signal?: AbortSignal): Promise<MediaUpload>
  tools(): Promise<ListedTool[]>
  subscribeTools(changed: () => void): Promise<() => Promise<void>>
  call(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<CalledTool>
  read(uri: string): Promise<unknown>
  subscribe(uri: string, changed: () => void): Promise<() => Promise<void>>
  close(): Promise<void>
}

export interface PreparedMcpCall {
  call(signal?: AbortSignal): Promise<CalledTool>
  close(): Promise<void>
}

function called(result: CallToolResult): CalledTool {
  const content = Array.isArray(result.content) ? result.content as { type: string, text?: unknown, data?: unknown, mimeType?: unknown }[] : []
  return { isError: result.isError === true,
    text: content.flatMap(part => part.type === 'text' && typeof part.text === 'string' ? [part.text] : []).join('\n'),
    images: content.flatMap(part => part.type === 'image' && typeof part.data === 'string' && typeof part.mimeType === 'string' ? [{ data: part.data, mimeType: part.mimeType }] : []),
    ...isRecord(result.structuredContent) ? { structured: result.structuredContent } : {},
  }
}

const KINDS = new Set<string>(['read', ...APPROVAL_KINDS])
const CALL_TIMEOUT_MS = 10 * 60_000
const CLEANUP_TIMEOUT_MS = 2_000

export async function connectPresmiumMcp(url: string, token: string, name = 'presmium-dsh'): Promise<PresmiumMcpClient> {
  const client = new Client({ name, version: '0.1.0' }, { versionNegotiation: { mode: 'auto' } })
  await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }))
  type Subscription = Awaited<ReturnType<Client['listen']>>
  interface SubscriptionEntry {
    key: string | symbol
    label: string
    filter: Parameters<Client['listen']>[0]
    listeners: Set<() => void>
    controller: AbortController
    subscription?: Subscription
    opening?: Promise<void>
    queued: boolean
  }
  const toolsKey = Symbol('tools')
  const subscriptions = new Map<string | symbol, SubscriptionEntry>()
  let closed = false
  const active = (entry: SubscriptionEntry) => !closed && subscriptions.get(entry.key) === entry && entry.listeners.size > 0
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
    const opening = client.listen(entry.filter, { signal: entry.controller.signal }).then(async (subscription) => {
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
          console.error(`[presmium] the subscription to ${entry.label} did not reconnect: ${errorMessage(error)}`)
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
  client.setNotificationHandler('notifications/tools/list_changed', () => {
    const entry = subscriptions.get(toolsKey)
    if (entry) changed(entry)
  })
  client.onclose = () => { for (const entry of subscriptions.values()) changed(entry) }
  const subscribe = async (key: string | symbol, label: string, filter: SubscriptionEntry['filter'], onChanged: () => void) => {
    let entry = subscriptions.get(key)
    if (!entry) {
      entry = { key, label, filter, listeners: new Set(), controller: new AbortController(), queued: false }
      subscriptions.set(key, entry)
    }
    const own = entry
    const listener = () => onChanged()
    own.listeners.add(listener)
    const stop = async () => {
      own.listeners.delete(listener)
      if (own.listeners.size > 0 || subscriptions.get(key) !== own) return
      subscriptions.delete(key)
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
  }
  return {
    async prepareVoiceClone(args, signal) {
      if (closed) throw new Error('operation-unavailable')
      const { document, ...request } = structuredClone(args)
      const invoke = async (phase: 'prepare' | 'execute' | 'release', prepared?: string, signal?: AbortSignal) => called(await client.request({
        method: CLONE_PREPARATION_METHOD,
        params: { phase, ...document !== undefined ? { document } : {}, ...phase !== 'release' ? { request } : {}, ...prepared ? { prepared } : {} },
      }, CallToolResultSchema, { signal: phase === 'release' ? AbortSignal.timeout(CLEANUP_TIMEOUT_MS) : signal, timeout: phase === 'release' ? CLEANUP_TIMEOUT_MS : CALL_TIMEOUT_MS }))
      const response = await invoke('prepare', undefined, signal)
      if (response.isError) throw new Error(response.text)
      const value = response.structured ?? JSON.parse(response.text)
      if (!isRecord(value) || typeof value.prepared !== 'string' || !/^[a-f0-9]{64}$/.test(value.prepared)) throw new Error('operation-not-prepared')
      const prepared = value.prepared
      let retired = false, running: Promise<CalledTool> | undefined
      return {
        call(signal) {
          if (running) return running
          if (retired) return Promise.reject(new Error('voice-clone-expired'))
          running = invoke('execute', prepared, signal)
          return running
        },
        async close() {
          if (retired) return
          retired = true
          if (closed) return
          // A failed cleanup must not replace a completed paid operation; the native lease also expires.
          try {
            const result = await invoke('release', prepared)
            if (result.isError) throw new Error(result.text)
          } catch (error) { console.error(`[presmium] the prepared voice-clone input could not be released: ${errorMessage(error)}`) }
        },
      }
    },
    async uploadMedia(document, kind, file, signal) {
      if (closed) throw new Error('media-upload-unavailable')
      let named = false, cursor: string | undefined
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined)
        named = page.tools.some(tool => tool.name === 'prepare_media_upload')
        if (named || page.tools.some(tool => tool.name === 'read_operation')) break
        cursor = page.nextCursor
      } while (cursor)
      const request = async (args: Record<string, unknown>): Promise<MediaUpload> => {
        const response = await client.callTool({ name: named ? 'prepare_media_upload' : 'read_operation', arguments: named ? { document, ...args } : { operation: 'prepare_media_upload', arguments: { document, ...args } } }, { signal, timeout: CALL_TIMEOUT_MS })
        const value = response.structuredContent ?? JSON.parse(response.content.filter(part => part.type === 'text').map(part => part.text).join('\n'))
        if (response.isError) throw new Error(isRecord(value) && isRecord(value.error) && typeof value.error.code === 'string' ? value.error.code : 'media-upload-unavailable')
        if (!isRecord(value) || typeof value.upload !== 'string' || typeof value.url !== 'string' || value.kind !== kind) throw new Error('media-upload-unavailable')
        return value as unknown as MediaUpload
      }
      const grant = await request({ kind }), endpoint = new URL(url)
      if (!/^[a-f0-9]{64}$/.test(grant.upload) || !Number.isSafeInteger(grant.maxBytes) || grant.maxBytes < 1 || grant.maxBytes > (kind === 'audio' ? DOCUMENT_AUDIO_MAX_BYTES : DOCUMENT_IMAGE_MAX_BYTES)) throw new Error('media-upload-invalid')
      // Transfer only to this connection's origin/path; a public browser link may use another proxy address.
      const destination = new URL(`${endpoint.origin}${endpoint.pathname.replace(/\/mcp\/?$/, '')}${MEDIA_UPLOAD_PATH}/${grant.upload}`)
      if (!file.size || file.size > grant.maxBytes || typeof file.name !== 'string') throw new Error('media-upload-size')
      const sent = await fetch(destination, { method: 'POST', body: file, signal, credentials: 'omit', redirect: 'error', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/octet-stream', 'x-presmium-upload-name': encodeURIComponent(file.name) } })
      if (!sent.ok) throw Object.assign(new Error('media-upload-failed'), { upload: grant.upload })
      const ready = await request({ upload: grant.upload })
      if (ready.upload !== grant.upload || ready.state !== 'ready' || ready.byteLength !== file.size) throw new Error('media-upload-not-ready')
      return ready
    },
    async tools() {
      const listed: ListedTool[] = []
      let cursor: string | undefined
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined, { cacheMode: 'refresh' })
        for (const tool of page.tools) {
          const meta = isRecord(tool._meta) ? tool._meta : {}
          const kind = typeof meta[TOOL_KIND_META] === 'string' && KINDS.has(meta[TOOL_KIND_META]) ? meta[TOOL_KIND_META] as ListedTool['kind'] : (tool.annotations?.readOnlyHint ? 'read' : 'operate')
          const approval = meta[TOOL_APPROVAL_META] === 'allow' ? 'allow' : meta[TOOL_APPROVAL_META] === 'ask' ? 'ask' : undefined
          const workspace = meta[TOOL_WORKSPACE_META] === 'candidate' ? 'candidate' : meta[TOOL_WORKSPACE_META] === 'author' ? 'author' : undefined
          listed.push({ name: tool.name, description: tool.description ?? tool.name, inputSchema: tool.inputSchema as Record<string, unknown>, kind, ...approval ? { approval } : {}, ...workspace ? { workspace } : {} })
        }
        cursor = page.nextCursor
      } while (cursor)
      return listed
    },
    async subscribeTools(onChanged) {
      if (closed) throw new Error('the MCP client is closed')
      if (client.getProtocolEra() !== 'modern') throw new Error('live tool subscriptions need MCP 2026-07-28 or later')
      if (!client.getServerCapabilities()?.tools?.listChanged) throw new Error('this MCP server does not offer tool-list subscriptions')
      return subscribe(toolsKey, 'tools', { toolsListChanged: true }, onChanged)
    },
    async call(tool, args, signal) {
      const result = await client.callTool({ name: tool, arguments: args }, { signal, timeout: CALL_TIMEOUT_MS })
      return called(result)
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
      return subscribe(uri, uri, { resourceSubscriptions: [uri] }, onChanged)
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
    case 'build': return m.build(m.renderers(Array.isArray(args.to) ? args.to.map(text) : []))
    case 'rename_page':
    case 'edit_document':
    case 'apply_document_change': return m.applyDocumentChange
    case 'apply_page_duplication': return m.duplicatePage
    case 'apply_page_change': return m.applyPagePlan
    case 'start_transcription': return m.startTranscription
    case 'cancel_transcription': return m.cancelTranscription
    case 'apply_transcription_adoption': return m.adoptTranscription
    case 'classroom_start': return m.classroomStart(text(args.name))
    case 'classroom_end': return m.classroomEnd
    default: return m.tool(tool)
  }
}

export { compactToolCatalog, queryToolCatalog, resolveCatalogCall } from './tool-catalog.ts'
export type { CatalogCall } from './tool-catalog.ts'

export { isOrdinaryMediaCall, prepareMediaArguments, mediaResult } from './media-input.ts'
