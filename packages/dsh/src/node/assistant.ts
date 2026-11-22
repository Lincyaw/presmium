import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { errorMessage } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import type { DshContext } from './dsh-types.ts'
import { MODEL_PROVIDERS, MODEL_SETUP_PATHS, modelProvider } from '../model-providers.ts'
import type { FailedRequest, TurnOutcome, ModelProvider, ModelProviderState, ModelSetupFailure, ModelSetupRequest, ModelTestAnswer } from '../model-providers.ts'

export const name = 'presmium-assistant'
export const inject = ['presmium', 'connection', 'settings', 'credentials']

type PathOp = { op: 'set', path: readonly string[], value: unknown } | { op: 'unset', path: readonly string[] }

interface Settings {
  readonly writable: boolean
  describe(options?: { redactSecrets?: boolean }): { ns: string, value: unknown, user?: unknown, revision: number }[]
  mutate(ns: string, ops: readonly PathOp[], expectedRevision?: number): Promise<void>
}

interface Credentials {
  resolve(ref: string): Promise<{ value: string, source: string } | undefined>
  describe(ref: string): Promise<{ configured: boolean, source?: string, writable: boolean }>
  set(ref: string, value: string): Promise<void>
}

interface DefaultModel {
  currentSelection(): { provider: string, model: string }
  saveSelection(selection: { provider: string, model: string }): Promise<void>
}

type AssistantContext = DshContext & { settings: Settings, credentials: Credentials }

const TEST_MS = 15_000
const FAILED_KEPT = 50
// The same rule as Harness's own key field: printable ASCII after trimming, not a pasted `NAME=value` line or quoted.
const KEY = /^[\x21-\x7E]+$/

function readKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const key = value.trim()
  if (!key) return undefined
  if (!KEY.test(key) || /^[A-Z_][A-Z0-9_]*=/.test(key) || /^(["']).*\1$/.test(key)) return ''
  return key
}

function readURL(value: unknown): string | undefined | null {
  if (typeof value !== 'string' || !value.trim()) return undefined
  try {
    const url = new URL(value.trim())
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password || url.search || url.hash) return null
    return url.toString().replace(/\/+$/, '')
  } catch {
    return null
  }
}

const readModel = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : undefined

/** Where a test request goes, in the form each protocol's adapter addresses it. */
function testRequest(provider: ModelProvider, baseURL: string, key: string, model: string): { url: string, init: RequestInit } {
  const body = JSON.stringify({ model, max_tokens: 16, messages: [{ role: 'user', content: 'Reply with OK.' }] })
  if (provider.protocol === 'anthropic-messages') {
    const url = /\/v1$/.test(baseURL) ? `${baseURL}/messages` : `${baseURL}/v1/messages`
    return { url, init: { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': key, 'authorization': `Bearer ${key}`, 'anthropic-version': '2023-06-01' }, body } }
  }
  return { url: `${baseURL}/chat/completions`, init: { method: 'POST', headers: { 'content-type': 'application/json', 'authorization': `Bearer ${key}` }, body } }
}

/** A provider's answer to the test, by status; the body is read only to tell a used-up quota from a busy service. */
async function testOutcome(response: Response): Promise<ModelTestAnswer> {
  if (response.ok) {
    await response.body?.cancel().catch(() => {})
    return { ok: true }
  }
  const status = response.status
  const text = (await response.text().catch(() => '')).toLowerCase()
  const quota = /quota|balance|insufficient|arrear|余额|欠费/.test(text)
  const failure: ModelSetupFailure = status === 401 || status === 403 ? 'key-rejected'
    : status === 402 || quota ? 'quota'
      : status === 404 ? 'not-found'
        : status === 429 || status >= 500 ? 'busy'
          : 'rejected'
  return { ok: false, failure, status }
}

interface FailedRecord extends FailedRequest {
  cwd?: string
  time: number
}

interface FailedStore {
  /** When an AI request last finished; failures before it are no longer the author's open business. */
  completed: number
  failed: FailedRecord[]
}

export function apply(ctx: AssistantContext): void {
  const log = ctx.logger?.('presmium') ?? console
  const defaultModel = () => ctx.get('agentDefaultModel') as DefaultModel | undefined

  const sectionValue = (ns: string) => ctx.settings.describe({ redactSecrets: true }).find(entry => entry.ns === ns)
  const profileOf = (provider: ModelProvider): Record<string, unknown> | undefined => {
    const value = sectionValue(provider.section)?.value as Record<string, unknown> | undefined
    if (!value) return undefined
    return provider.section === 'llm-deepseek' ? value : (value.providers as Record<string, Record<string, unknown>> | undefined)?.[provider.route]
  }
  const endpointOf = (provider: ModelProvider): string => {
    const configured = profileOf(provider)?.baseURL
    if (typeof configured === 'string' && configured) return configured
    if (provider.id === 'deepseek' && process.env.DEEPSEEK_BASE_URL) return process.env.DEEPSEEK_BASE_URL.replace(/\/+$/, '')
    return provider.baseURL
  }
  const modelOf = (provider: ModelProvider): string => {
    const selection = defaultModel()?.currentSelection()
    if (selection?.provider === provider.route) return selection.model
    const models = profileOf(provider)?.models
    const first = Array.isArray(models) ? (models[0] as { id?: unknown } | undefined)?.id : undefined
    return typeof first === 'string' && provider.id !== 'deepseek' ? first : provider.model
  }
  const keyOf = (provider: ModelProvider): string => {
    const named = profileOf(provider)?.apiKeyEnv
    return typeof named === 'string' && named ? named : provider.key
  }

  const states = async (): Promise<ModelProviderState[]> => {
    const active = defaultModel()?.currentSelection().provider
    return Promise.all(MODEL_PROVIDERS.map(async (provider) => {
      const configured = provider.id === 'custom' && !profileOf(provider) ? undefined : await ctx.credentials.describe(keyOf(provider)).catch(() => undefined)
      return {
        id: provider.id,
        configured: Boolean(configured?.configured),
        fromEnvironment: Boolean(configured?.configured && configured.source === 'env'),
        baseURL: endpointOf(provider),
        model: modelOf(provider),
        active: active === provider.route && Boolean(configured?.configured),
      }
    }))
  }

  /** The route's profile as this page writes it; other fields of an existing profile stay as they are. */
  const profileOps = (provider: ModelProvider, baseURL: string | undefined, model: string): PathOp[] => {
    // An address left blank keeps the one the route has.
    if (provider.section === 'llm-deepseek') {
      if (!baseURL) return []
      return [baseURL !== provider.baseURL ? { op: 'set', path: ['baseURL'], value: baseURL } : { op: 'unset', path: ['baseURL'] }]
    }
    const at = (field: string) => ['providers', provider.route, field]
    const ops: PathOp[] = [
      { op: 'set', path: at('apiKeyEnv'), value: keyOf(provider) },
      { op: 'set', path: at('baseURL'), value: baseURL || endpointOf(provider) },
      { op: 'set', path: at('models'), value: [{ id: model, api: 'openai-completions' }] },
    ]
    if (provider.id === 'custom') {
      ops.push(
        { op: 'set', path: at('displayName'), value: new URL(baseURL || endpointOf(provider)).host },
        { op: 'set', path: at('api'), value: 'openai-completions' },
        { op: 'set', path: at('compat'), value: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' } },
      )
    } else {
      ops.push({ op: 'set', path: at('displayName'), value: { qwen: 'Qwen', kimi: 'Kimi', zhipu: 'GLM' }[provider.id as 'qwen' | 'kimi' | 'zhipu'] })
    }
    return ops
  }

  type Read = { provider: ModelProvider, key?: string, baseURL?: string, model: string } | { failure: ModelSetupFailure }
  const readRequest = (body: unknown): Read => {
    const request = (body ?? {}) as Partial<ModelSetupRequest>
    const provider = modelProvider(request.id)
    if (!provider) return { failure: 'failed' }
    const key = readKey(request.key)
    if (key === '') return { failure: 'invalid-key' }
    const baseURL = readURL(request.baseURL)
    if (baseURL === null) return { failure: 'invalid-address' }
    if (provider.id === 'custom' && !baseURL && !profileOf(provider)) return { failure: 'invalid-address' }
    const model = readModel(request.model) ?? (provider.id === 'custom' && !profileOf(provider) ? undefined : modelOf(provider))
    if (!model) return { failure: 'no-model' }
    return { provider, model, ...key ? { key } : {}, ...baseURL ? { baseURL } : {} }
  }

  const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })

  ctx.connection.fetch.register({
    path: MODEL_SETUP_PATHS.providers, methods: ['GET'], requestBody: 'buffered',
    async fetch() {
      return json({ providers: await states(), writable: ctx.settings.writable })
    },
  })

  ctx.connection.fetch.register({
    path: MODEL_SETUP_PATHS.test, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      const read = readRequest(await request.json().catch(() => null))
      if ('failure' in read) return json({ ok: false, failure: read.failure } satisfies ModelTestAnswer)
      const { provider } = read
      const key = read.key ?? (await ctx.credentials.resolve(keyOf(provider)).catch(() => undefined))?.value
      if (!key) return json({ ok: false, failure: 'no-key' } satisfies ModelTestAnswer)
      const baseURL = read.baseURL ?? endpointOf(provider)
      if (!baseURL) return json({ ok: false, failure: 'invalid-address' } satisfies ModelTestAnswer)
      const { url, init } = testRequest(provider, baseURL, key, read.model)
      try {
        return json(await testOutcome(await fetch(url, { ...init, signal: AbortSignal.any([request.signal, AbortSignal.timeout(TEST_MS)]) })))
      } catch (error) {
        log.debug(`presmium-assistant: the connection test of ${provider.id} did not reach ${new URL(url).host}: ${errorMessage(error)}`)
        return json({ ok: false, failure: 'unreachable' } satisfies ModelTestAnswer)
      }
    },
  })

  ctx.connection.fetch.register({
    path: MODEL_SETUP_PATHS.save, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      if (!ctx.settings.writable) return json({ failure: 'read-only' }, 409)
      const read = readRequest(await request.json().catch(() => null))
      if ('failure' in read) return json({ failure: read.failure }, 400)
      const { provider } = read
      if (!read.key && !(await ctx.credentials.describe(keyOf(provider)).catch(() => undefined))?.configured) return json({ failure: 'no-key' }, 400)
      try {
        const ops = profileOps(provider, read.baseURL, read.model)
        if (ops.length) await ctx.settings.mutate(provider.section, ops, sectionValue(provider.section)?.revision)
        if (read.key) await ctx.credentials.set(keyOf(provider), read.key)
        await defaultModel()?.saveSelection({ provider: provider.route, model: read.model })
      } catch (error) {
        log.warn(`presmium-assistant: the ${provider.id} model settings were not saved: ${errorMessage(error)}`)
        return json({ failure: 'failed' }, 500)
      }
      return json({ providers: await states(), writable: ctx.settings.writable, selected: { provider: provider.route, model: read.model } })
    },
  })

  // The author's last failed request in each chat, kept across restarts: Resend sends its words again, and a restarted
  // Studio reopens the chat whose request failed last, unless a request has finished since.
  const storePath = join(process.env.DSH_HOME || join(process.env.HOME ?? '.', '.dsh'), 'presmium', 'failed-requests.json')
  let store: FailedStore = { completed: 0, failed: [] }
  try {
    const read = JSON.parse(readFileSync(storePath, 'utf8')) as FailedStore
    if (Array.isArray(read.failed) && typeof read.completed === 'number') store = read
  } catch {
  }
  const persist = () => {
    try {
      mkdirSync(dirname(storePath), { recursive: true })
      const temporary = `${storePath}.${process.pid}.tmp`
      writeFileSync(temporary, JSON.stringify(store), { mode: 0o600 })
      renameSync(temporary, storePath)
    } catch (error) {
      log.debug(`presmium-assistant: the failed requests were not kept: ${errorMessage(error)}`)
    }
  }
  const asked = new Map<string, string>()
  const cwds = new Map<string, string>()
  const outcomes = new Map<string, TurnOutcome>()

  ctx.on('agent/created', ({ agent }: { agent: { session: { id: string, header?: { cwd?: string } } } }) => {
    const cwd = agent.session.header?.cwd
    if (cwd) cwds.set(agent.session.id, cwd)
  })
  ctx.on('session/event', (session: { id: string, header?: { cwd?: string } }, event: { type: string, data?: Record<string, any> }) => {
    if (event.type === 'user/message') {
      const message = event.data as { content?: { type: string, text?: string }[], source?: { kind?: string } } | undefined
      // The author's own words; context the harness adds to a turn carries other sources.
      if (message?.source?.kind !== 'user') return
      const text = message?.content?.filter(part => part.type === 'text' && part.text).map(part => part.text).join('\n')
      if (text) asked.set(session.id, text)
      return
    }
    if (event.type !== 'turn/end' || typeof event.data?.turn !== 'number') return
    const kind = event.data.reason?.kind
    const turn = event.data.turn as number
    outcomes.set(session.id, { session: session.id, turn, outcome: kind === 'error' ? 'failed' : kind === 'completed' || kind === 'max-tokens' ? 'done' : 'cancelled' })
    const others = store.failed.filter(record => record.session !== session.id)
    if (kind === 'error') {
      const cwd = session.header?.cwd ?? cwds.get(session.id)
      // A turn can fail before the request enters it; then the request is still the one that failed before.
      const text = asked.get(session.id) ?? store.failed.find(record => record.session === session.id)?.text
      store = { completed: store.completed, failed: [...others, { session: session.id, turn, time: Date.now(), ...text ? { text } : {}, ...cwd ? { cwd } : {} }].slice(-FAILED_KEPT) }
      persist()
    } else if (kind === 'completed' || kind === 'max-tokens') {
      asked.delete(session.id)
      store = { completed: Date.now(), failed: others }
      persist()
    }
  })
  ctx.on('session/disposed', (session: { id: string }) => {
    asked.delete(session.id)
    cwds.delete(session.id)
    outcomes.delete(session.id)
  })

  ctx.connection.fetch.register({
    path: MODEL_SETUP_PATHS.turn, methods: ['GET'], requestBody: 'buffered',
    async fetch(request) {
      return json(outcomes.get(new URL(request.url).searchParams.get('session') ?? '') ?? null)
    },
  })

  ctx.connection.fetch.register({
    path: MODEL_SETUP_PATHS.failed, methods: ['GET'], requestBody: 'buffered',
    async fetch(request) {
      const session = new URL(request.url).searchParams.get('session')
      if (session) {
        const record = store.failed.find(candidate => candidate.session === session)
        return record ? json({ session: record.session, turn: record.turn, ...record.text ? { text: record.text } : {} } satisfies FailedRequest) : json(null)
      }
      const { root } = await ctx.presmium.server.ready
      const latest = store.failed.filter(record => record.time > store.completed && (!record.cwd || isInside(record.cwd, root))).at(-1)
      return json(latest ? { session: latest.session, turn: latest.turn } satisfies FailedRequest : null)
    },
  })
}
