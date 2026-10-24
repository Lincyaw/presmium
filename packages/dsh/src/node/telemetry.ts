import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { errorMessage } from '@lincyaw/kernel'
import type { DshContext, DshOtel, DshOtelScalar, DshSessionEvent } from './dsh-types.ts'

export const name = 'presmium-telemetry'
export const inject = ['otel', 'presmium']

/** The operator's collector: an OTLP/HTTP logs endpoint, its headers (`key=value,…`), and who is using this machine. */
interface Config {
  url?: string
  headers?: string
  user?: string
}

/** The page that reports operations: one load of the workbench, in one browser. */
export interface OperationClient {
  id: string
  browser?: string
  locale?: string
}

/** One operation of the author in the workbench, as the page records it. */
export interface OperationRecord {
  name: string
  time: number
  seq: number
  attributes: Record<string, DshOtelScalar>
}

/** What the bundle collects for the operator: each session's events and the author's operations in the workbench. */
export interface PresmiumTelemetry {
  readonly enabled: boolean
  operations(client: OperationClient, records: readonly OperationRecord[]): void
}

const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SCOPE = { name: '@lincyaw/dsh', version: (JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as { version: string }).version }
// A deadline for the queues at the host's exit: what is not sent by then is lost.
const DRAIN_MS = 3000

/** `key=value,key=value`, values percent-encoded, as in OTEL_EXPORTER_OTLP_HEADERS. */
export function parseHeaders(text: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const pair of (text ?? '').split(',')) {
    const at = pair.indexOf('=')
    if (at <= 0) continue
    headers[pair.slice(0, at).trim().toLowerCase()] = decodeURIComponent(pair.slice(at + 1).trim())
  }
  return headers
}

/** An id of this installation, kept in the state directory, so that its reports can be told apart from another's. */
function installationId(): string {
  const file = join(process.env.DSH_HOME ?? join(homedir(), '.presmium'), 'telemetry-installation')
  try {
    if (existsSync(file)) return readFileSync(file, 'utf8').trim()
    mkdirSync(dirname(file), { recursive: true })
    const id = randomUUID()
    writeFileSync(file, `${id}\n`)
    return id
  } catch {
    return randomUUID()
  }
}

export function apply(ctx: DshContext & { otel: DshOtel }, config: Config = {}): void {
  if (!config.url) {
    ctx.provide('presmiumTelemetry', { enabled: false, operations() {} } satisfies PresmiumTelemetry)
    return
  }
  const log = ctx.logger?.('presmium') ?? console
  const exporter = { url: config.url, headers: parseHeaders(config.headers) }
  const resourceAttributes = { 'service.name': 'presmium-studio', 'service.version': SCOPE.version, 'presmium.installation.id': installationId(), ...config.user ? { 'user.id': config.user } : {} }
  const onFailure = (message: string, error?: Error) => log.warn(`presmium-telemetry: ${message}${error ? `: ${errorMessage(error)}` : ''}`)
  const sessions = ctx.otel.createSessionLogReporter({ exporter, scope: SCOPE, resourceAttributes, onFailure })
  const operations = ctx.otel.createEventReporter({ exporter, scope: SCOPE, resourceAttributes, onFailure, processor: { scheduledDelayMillis: 1000, maxExportBatchSize: 512 } })
  let workspace: string | undefined
  void ctx.presmium.server.ready.then(({ root }) => workspace = basename(root), () => undefined)

  // Every event of every session, whole: the trajectory of the conversation and of each turn of the model.
  const turns = new Map<string, number>()
  ctx.on('session/event', (session: { id: string }, event: DshSessionEvent) => {
    const data = event.data as { turn?: unknown } | undefined
    if (event.type === 'turn/start' && typeof data?.turn === 'number') turns.set(session.id, data.turn)
    const turn = turns.get(session.id)
    const document = ctx.presmium.bindings.documentOf(session.id)
    sessions.reportSessionLog({
      sessionId: session.id,
      event,
      attributes: { ...workspace ? { 'presmium.workspace': workspace } : {}, ...document === undefined ? {} : { 'presmium.document': document }, ...turn === undefined ? {} : { 'presmium.turn': turn } },
    })
  })
  ctx.on('session/disposed', (session: { id: string }) => void turns.delete(session.id))

  ctx.provide('presmiumTelemetry', {
    enabled: true,
    operations(client, records) {
      for (const record of records) {
        operations.emit({
          eventName: `presmium.workbench.${record.name}`,
          body: record.name,
          timestamp: record.time,
          attributes: {
            ...record.attributes,
            'presmium.operation': record.name,
            'presmium.seq': record.seq,
            'presmium.client.id': client.id,
            ...client.browser ? { 'presmium.browser.id': client.browser } : {},
            ...client.locale ? { 'presmium.locale': client.locale } : {},
            ...workspace ? { 'presmium.workspace': workspace } : {},
          },
        })
      }
    },
  } satisfies PresmiumTelemetry)
  ctx.effect(() => () => {
    const deadline = AbortSignal.timeout(DRAIN_MS)
    void operations.shutdown(deadline).catch(() => undefined)
    const drained = sessions.shutdown().catch(() => undefined)
    void Promise.race([drained, new Promise(done => setTimeout(done, DRAIN_MS).unref())]).then(() => sessions.stopPending())
  })
}
