import { randomUUID } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { errorMessage, hasRole, isRecord, jsonResponse, MAX_BODY, problemResponse, sseResponse } from '@lincyaw/kernel'
import type { AuthoringDiagnostics, CanonicalSource, Finding, Member, PreviewDiagnostics } from '@lincyaw/kernel'
import type { McpHost } from '@lincyaw/mcp'
import type { ControlChannel, WindowPosition } from './control.ts'
import type { DiagnosticStore } from './diagnostics.ts'
import { toFocusRequest } from './focus.ts'
import type { FocusStore } from './focus.ts'
import { hasBearerToken, limitBody } from './http.ts'
import type { McpTokens } from './mcp-access.ts'
import type { ServerHost } from './server-host.ts'

export const SERVER_PATH = '/__presmium/presmium.server'

export interface ServerRoutesOptions {
  control: ControlChannel
  mcpTokens: McpTokens
  focus: FocusStore
  diagnostics: DiagnosticStore
  mcpHost: McpHost
  serverHost?: ServerHost
  launcherToken?: string
}

export interface ServerRouteContext {
  member: Member
  document: string
  req: IncomingMessage
}

/** The server's own routes under SERVER_PATH: hello, control, tokens, focus and diagnostics. */
export function createServerRouteHandler(options: ServerRoutesOptions): (request: Request, route: string, ctx: ServerRouteContext) => Promise<Response> {
  const { control, mcpTokens, focus, diagnostics, launcherToken } = options
  const isFromLauncher = (request: Request) => launcherToken !== undefined && hasBearerToken(request, launcherToken)
  const hasDocument = async (serverHost: ServerHost, document: string) => (await serverHost.documents()).some(doc => doc.dir === document)

  const controlRoute = async (request: Request, { member, document, req }: ServerRouteContext): Promise<Response> => {
    if (request.method === 'GET') {
      const window = new URL(request.url).searchParams.get('window') || randomUUID()
      const stream = control.open(window, member, document)
      req.once('close', () => stream.end())
      return sseResponse(stream, request.signal)
    }
    if (request.method !== 'POST') return problemResponse(405, 'GET or POST')
    const limited = await limitBody(request, MAX_BODY)
    if (limited instanceof Response) return limited
    const body: unknown = await limited.json().catch(() => undefined)
    if (!isRecord(body)) return problemResponse(400, 'a JSON object')
    if (body.type === 'answer' && typeof body.id === 'string') {
      const status = control.answer(body.id, body.allow === true, member)
      return status === 200 ? jsonResponse({ ok: true }) : problemResponse(status, status === 404 ? 'no such approval' : 'this member may not answer this approval')
    }
    if (body.type === 'report' && typeof body.window === 'string') {
      const position = toWindowPosition(body.position)
      const ok = control.report(body.window, member, { position, role: typeof body.role === 'string' ? body.role : undefined, status: isRecord(body.status) ? body.status : undefined })
      return ok ? jsonResponse({ ok: true }) : problemResponse(404, 'unknown window')
    }
    return problemResponse(400, 'unknown message')
  }

  const tokensRoute = async (request: Request): Promise<Response> => {
    if (!launcherToken) return problemResponse(403, 'session tokens are issued only to the host that started this service (PRESMIUM_SERVICE_TOKEN)')
    if (!isFromLauncher(request)) return problemResponse(401, 'session tokens need Authorization: Bearer <the service token>')
    const limited = await limitBody(request, MAX_BODY)
    if (limited instanceof Response) return limited
    const body: unknown = await limited.json().catch(() => ({}))
    const session = isRecord(body) && typeof body.session === 'string' && body.session !== '' ? body.session : undefined
    if (request.method === 'DELETE') return jsonResponse({ revoked: mcpTokens.revokeAgentSessions(session) })
    if (request.method !== 'POST') return problemResponse(405, 'POST or DELETE')
    if (!isRecord(body) || typeof body.document !== 'string' || session === undefined) return problemResponse(400, '{ document, session }')
    const document = body.document
    if (options.serverHost && !(await hasDocument(options.serverHost, document))) return problemResponse(404, `no document ${JSON.stringify(document)}`)
    const grant = mcpTokens.grantAgentSession(session, document)
    return jsonResponse({ url: grant.url, token: grant.token, document }, 201)
  }

  const focusRoute = async (request: Request, member: Member): Promise<Response> => {
    if (request.method === 'GET') {
      const params = new URL(request.url).searchParams
      const found = focus.find(params.has('document') ? params.get('document')! : undefined)
      return jsonResponse(found ? { document: found.document, focus: found.focus, reported: new Date(found.at).toISOString() } : { focus: null })
    }
    if (request.method !== 'POST') return problemResponse(405, 'GET or POST')
    if (launcherToken && !isFromLauncher(request)) return problemResponse(401, 'a focus report needs Authorization: Bearer <the service token>')
    const { serverHost } = options
    if (!serverHost) return problemResponse(409, 'this server compiles no document')
    const limited = await limitBody(request, MAX_BODY)
    if (limited instanceof Response) return limited
    const body = toFocusRequest(await limited.json().catch(() => undefined))
    if (typeof body === 'string') return problemResponse(400, body)
    const workspaceFocus = body.focus.filter(report => report.scope === 'workspace')
    if (workspaceFocus.length && !hasRole(member, 'owner')) return problemResponse(403, 'workspace source selections need the owner role')
    if (workspaceFocus.length && !serverHost.readSource) return problemResponse(400, 'this host does not read workspace source selections')
    if (!(await hasDocument(serverHost, body.document))) return problemResponse(404, `no document ${JSON.stringify(body.document)}`)
    try {
      const doc = body.focus.some(report => report.scope !== 'workspace') ? (await serverHost.compile(body.document)).doc : undefined
      const sources = new Map(await Promise.all(workspaceFocus.map(async (report) => {
        const path = report.source!.file
        return [path, (await serverHost.readSource!(path, member)).content] as const
      })))
      const record = focus.report(body.document, doc, body.focus, path => sources.get(path)!)
      return jsonResponse({ document: record.document, focus: record.focus, reported: new Date(record.at).toISOString() })
    } catch (error) {
      return problemResponse(400, errorMessage(error))
    }
  }

  const diagnosticsRoute = async (request: Request, stream: boolean, req: IncomingMessage): Promise<Response> => {
    if (launcherToken && !isFromLauncher(request)) return problemResponse(401, 'diagnostics need Authorization: Bearer <the service token>')
    const { serverHost } = options
    if (!serverHost) return problemResponse(409, 'this server compiles no document')
    const params = new URL(request.url).searchParams
    if (request.method === 'GET') {
      const document = params.has('document') ? params.get('document')! : undefined
      if (document !== undefined) {
        if (!(await hasDocument(serverHost, document))) return problemResponse(404, `no document ${JSON.stringify(document)}`)
        await options.mcpHost.diagnostics!(document)
      }
      if (!stream) return jsonResponse(diagnostics.snapshot(document))
      const connection = new AbortController()
      req.once('close', () => connection.abort())
      return sseResponse(diagnostics.events(document, AbortSignal.any([connection.signal, request.signal])), request.signal)
    }
    if (request.method !== 'POST' || stream) return problemResponse(405, stream ? 'GET' : 'GET or POST')
    const limited = await limitBody(request, MAX_BODY)
    if (limited instanceof Response) return limited
    const body: unknown = await limited.json().catch(() => undefined)
    const report = toPreviewDiagnostics(body)
    if (typeof report === 'string') return problemResponse(400, report)
    if (!(await hasDocument(serverHost, report.document))) return problemResponse(404, `no document ${JSON.stringify(report.document)}`)
    return jsonResponse({ accepted: diagnostics.report(report) })
  }

  return async (request, route, ctx) => {
    if (route === 'hello') return jsonResponse({ member: ctx.member, document: ctx.document })
    if (route === 'control') return await controlRoute(request, ctx)
    if (route === 'tokens') return await tokensRoute(request)
    if (route === 'focus') return await focusRoute(request, ctx.member)
    if (route === 'diagnostics/authoring') {
      if (launcherToken && !isFromLauncher(request)) return problemResponse(401, 'authoring diagnostics need the service token')
      if (!hasRole(ctx.member, 'editor')) return problemResponse(403, 'authoring diagnostics need the role editor')
      if (request.method !== 'POST') return problemResponse(405, 'POST')
      if (!options.serverHost?.authoring) return problemResponse(409, 'authoring diagnostics are unavailable')
      const limited = await limitBody(request, 64 << 10)
      if (limited instanceof Response) return limited
      const report = toAuthoringDiagnostics(await limited.json().catch(() => undefined))
      if (typeof report === 'string') return problemResponse(400, report)
      if (!(await hasDocument(options.serverHost, report.document))) return problemResponse(404, 'no such authoring document')
      diagnostics.reportAuthoring(report, ctx.member.id)
      return jsonResponse({ accepted: true })
    }
    if (route === 'diagnostics' || route === 'diagnostics/events') return await diagnosticsRoute(request, route === 'diagnostics/events', ctx.req)
    return problemResponse(404, 'not found')
  }
}

function toAuthoringDiagnostics(body: unknown): AuthoringDiagnostics | string {
  if (!isRecord(body) || Object.keys(body).some(key => !['document', 'instance', 'findings'].includes(key))
    || typeof body.document !== 'string' || body.document.length > 1024 || typeof body.instance !== 'string' || !/^workbench:[a-zA-Z0-9.-]{1,80}$/.test(body.instance)
    || !Array.isArray(body.findings) || body.findings.length > 20) return 'authoring diagnostics need document, workbench instance and at most 20 findings'
  const findings: AuthoringDiagnostics['findings'] = []
  for (const item of body.findings) {
    if (!isRecord(item) || Object.keys(item).some(key => !['checkId', 'severity', 'message', 'authoringSource'].includes(key))
      || typeof item.checkId !== 'string' || !item.checkId.startsWith('presmium.workbench.') || item.checkId.length > 100
      || item.severity !== 'error' || typeof item.message !== 'string' || item.message.length > 600) return 'invalid authoring diagnostic'
    let source: CanonicalSource | undefined
    if (item.authoringSource !== undefined) {
      const value = item.authoringSource
      if (!isRecord(value) || Object.keys(value).some(key => !['documentId', 'version', 'fingerprint'].includes(key))
        || !['documentId', 'version'].every(key => typeof value[key] === 'string' && (value[key] as string).length > 0 && (value[key] as string).length <= 200)
        || typeof value.fingerprint !== 'string' || !/^[a-f\d]{16}$/.test(value.fingerprint)) return 'invalid authoring diagnostic source'
      source = { documentId: value.documentId as string, version: value.version as string, fingerprint: value.fingerprint }
    }
    findings.push({ checkId: item.checkId, severity: 'error', message: item.message, ...source ? { authoringSource: source } : {} })
  }
  return { document: body.document, instance: body.instance, findings }
}

function toPreviewDiagnostics(body: unknown): PreviewDiagnostics | string {
  if (!isRecord(body) || typeof body.document !== 'string' || (body.renderer !== 'web' && body.renderer !== 'slides') || typeof body.instance !== 'string' || !body.instance || typeof body.revision !== 'string' || !Array.isArray(body.findings)) return 'a preview diagnostic report needs document, renderer, instance, revision and findings'
  const findings: Finding[] = []
  for (const item of body.findings) {
    if (!isRecord(item) || typeof item.checkId !== 'string' || typeof item.message !== 'string' || !['error', 'warning', 'info'].includes(String(item.severity))) return 'each diagnostic needs checkId, severity and message'
    if (item.hint !== undefined && typeof item.hint !== 'string') return 'a diagnostic hint must be text'
    if (item.source !== undefined && (!isRecord(item.source) || typeof item.source.file !== 'string' || (item.source.line !== undefined && (!Number.isInteger(item.source.line) || Number(item.source.line) < 1)))) return 'a diagnostic source needs a file and an optional positive line'
    findings.push({ checkId: item.checkId, severity: item.severity as Finding['severity'], message: item.message, ...item.hint ? { hint: item.hint as string } : {}, ...item.source ? { source: item.source as Finding['source'] } : {} })
  }
  return { document: body.document, renderer: body.renderer, instance: body.instance, revision: body.revision, findings }
}

function toWindowPosition(value: unknown): WindowPosition | undefined {
  if (!isRecord(value) || typeof value.slide !== 'number' || typeof value.step !== 'number') return undefined
  const { trail } = value
  return {
    slide: value.slide,
    step: value.step,
    ...typeof value.view === 'string' ? { view: value.view } : {},
    ...typeof value.section === 'string' ? { section: value.section } : {},
    ...Array.isArray(trail) && trail.length <= 10_000 && trail.every(key => typeof key === 'string') ? { trail: trail as string[] } : {},
  }
}
