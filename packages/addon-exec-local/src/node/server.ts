/**
 * The local environment's routes (`server`), under
 * `/__presmium/presmium.execLocal/` in `presmium dev` and `presmium serve`;
 * the server gives them the member, the roles and the deck's configuration.
 * Editors only:
 *
 * - `GET  status`     what is available: Docker, the devcontainer definition, the languages
 * - `POST run`        RunRequest -> RunResult, in the devcontainer image (P-22), once an
 *                     `operate` approval allows it
 * - `POST replicate`  ReplicateRequest -> zip archive (P-26)
 *
 * Each answer is in the language the page asks for (`Accept-Language`).
 */
import { relative, resolve, sep } from 'node:path'
import { APPROVALS, errorMessage, isRecord, json, problem } from '@presmium/kernel'
import type { Route, RunRequest, ServerContext, ServerContribution } from '@presmium/kernel'
import { EXEC_LOCAL_ID, execLocalConfig, failedContainerRun } from '../domain/index.ts'
import type { LocalEnvStatus } from '../domain/index.ts'
import { definitionRunners, dockerAvailable, findDefinition, readDevcontainer, runInContainer } from './container.ts'
import { inLanguage, text } from './messages.ts'
import { PathError, replicateArchive, requirePath } from './replicate.ts'

/** A request the route refuses, with its status. */
class Refused extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** The JSON object of a request's body. */
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Refused(415, text().notJson)
  let value: unknown
  try {
    value = JSON.parse(await request.text() || '{}')
  } catch {
    throw new Refused(400, text().invalidJson)
  }
  if (!isRecord(value)) throw new Refused(400, text().notObject)
  return value
}

function string(body: Record<string, unknown>, key: string, optional = false): string | undefined {
  const value = body[key]
  if (value === undefined && optional) return undefined
  if (typeof value !== 'string') throw new Refused(400, optional ? text().notString(key) : text().missingField(key))
  return value
}

/** A mapping of names to strings from a request (`args`, `files`), or undefined. */
function stringTable(body: Record<string, unknown>, key: string): Record<string, string> | undefined {
  const value = body[key]
  if (value === undefined) return undefined
  if (!isRecord(value) || Object.values(value).some(v => typeof v !== 'string')) throw new Refused(400, text().notStringTable(key))
  return value as Record<string, string>
}

function runRequest(body: Record<string, unknown>): RunRequest {
  const files = stringTable(body, 'files')
  for (const file of Object.keys(files ?? {})) requirePath(file)
  return {
    lang: string(body, 'lang')!,
    code: string(body, 'code')!,
    args: stringTable(body, 'args'),
    stdin: string(body, 'stdin', true),
    timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
    files,
  }
}

async function status(workspace: string): Promise<LocalEnvStatus> {
  const definition = findDefinition(workspace)
  const docker = await dockerAvailable()
  return {
    connected: true,
    docker,
    devcontainer: definition ? relative(workspace, definition).split(sep).join('/') : null,
    languages: docker && definition ? Object.keys(definitionRunners(definition)) : [],
  }
}

/** A route of an editor, answered in the request's language; a refusal is an error response. */
function route(handle: (request: Request, member: string) => Promise<Response>): Route {
  return {
    handle: (request, ctx) => inLanguage(request.headers.get('accept-language') ?? undefined, async () => {
      try {
        return await handle(request, ctx.member.id)
      } catch (error) {
        if (error instanceof Refused) return problem(error.status, error.message)
        return problem(error instanceof PathError ? 400 : 500, errorMessage(error))
      }
    }),
  }
}

/**
 * The routes of the deck's workspace: `presmium.execLocal.workspace`
 * relative to the deck (which the compiler's pass settles, ./pass.ts), else
 * the workspace root.
 */
export function localEnvRoutes(ctx: ServerContext): ServerContribution {
  const { workspace: configured, buildTimeoutMs } = execLocalConfig(ctx.config)
  const workspace = configured === undefined ? ctx.workspaceRoot : resolve(ctx.deckDir, configured)
  return {
    routes: {
      status: route(async () => json(await status(workspace))),
      run: route(async (request, member) => {
        const run = runRequest(await body(request))
        // Running code in a container is an operation the member allows (10.4), as MCP's run_code is.
        const approvals = ctx.service(APPROVALS)
        const allowed = await approvals?.request({ kind: 'operate', scope: 'content', title: text().runTitle(run.lang), detail: run.code, from: EXEC_LOCAL_ID, member }, request.signal)
        if (!allowed) throw new Refused(403, text().notAllowed)
        if (!findDefinition(workspace)) return json(failedContainerRun(text().noDefinition))
        const devcontainer = await readDevcontainer(workspace)
        if (!devcontainer) return json(failedContainerRun(text().unreadableDefinition))
        // The client closing the request stops the container.
        return json(await runInContainer(workspace, devcontainer, run, { buildTimeoutMs }, request.signal))
      }),
      replicate: route(async (request) => {
        const fields = await body(request)
        const asked = { file: string(fields, 'file')!, content: string(fields, 'content')!, lang: string(fields, 'lang', true) }
        const definition = findDefinition(workspace)
        if (!definition) throw new Refused(404, text().noDefinition)
        const { name, zip } = replicateArchive(workspace, definition, asked)
        return new Response(new Uint8Array(zip), {
          headers: {
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
            'Cache-Control': 'no-store',
          },
        })
      }),
    },
  }
}
