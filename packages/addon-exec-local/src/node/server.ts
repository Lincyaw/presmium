/**
 * Dev-server endpoints of the local environment, a Vite plugin that the
 * plugin's `./presmium` entry gives the dev servers of both forms
 * (`vitePlugins`) and `setup/vite-plugins.ts` registers in Slidev's (K-09
 * write-back goes through here):
 *
 * - `GET  status`     what is available: Docker, devcontainer definition, git
 * - `POST run`        RunRequest -> RunResult, in the devcontainer image (P-22)
 * - `POST commit`     CommitRequest -> CommitResult, on a new branch (P-25)
 * - `POST replicate`  ReplicateRequest -> zip archive (P-26)
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { errorMessage, isRecord } from '@presmium/kernel'
import type { RunRequest } from '@presmium/kernel'
import { ENDPOINT, failedContainerRun } from '../domain/index.ts'
import type { LocalEnvStatus } from '../domain/index.ts'
import { definitionRunners, dockerAvailable, findDefinition, readDevcontainer, runInContainer } from './container.ts'
import { commitOnNewBranch, gitRoot } from './git.ts'
import { HttpError, optionalString, readJson, requirePath, requireString, sendJson } from './http.ts'
import { inLanguage, text } from './messages.ts'
import { replicateArchive } from './replicate.ts'

type Middleware = (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => void

/** The part of a Vite plugin used here, so the addon does not depend on vite itself. */
export interface DevServerPlugin {
  name: string
  apply: 'serve'
  configureServer(server: { middlewares: { use(path: string, handler: Middleware): unknown } }): void
}

export interface LocalEnvServerOptions {
  /** Absolute deck directory. */
  deckDir: string
  /** Workspace relative to the deck directory; defaults to the repository root of the deck. */
  workspace?: string
  /** How long building the devcontainer image may take (`presmium.execLocal.buildTimeoutMs`). */
  buildTimeoutMs?: number
}

async function status(workspace: string): Promise<LocalEnvStatus> {
  const definition = findDefinition(workspace)
  const [docker, root] = await Promise.all([dockerAvailable(), gitRoot(workspace)])
  return {
    connected: true,
    docker,
    devcontainer: definition ? relative(workspace, definition).split(sep).join('/') : null,
    git: root !== undefined,
    languages: docker && definition ? Object.keys(definitionRunners(definition)) : [],
  }
}

/** A mapping of names to strings from a request (`args`, `files`), or undefined. */
function stringTable(body: Record<string, unknown>, key: string): Record<string, string> | undefined {
  const value = body[key]
  if (value === undefined) return undefined
  if (!isRecord(value) || Object.values(value).some(v => typeof v !== 'string')) throw new HttpError(400, text().notStringTable(key))
  return value as Record<string, string>
}

function runRequest(body: Record<string, unknown>): RunRequest {
  const files = stringTable(body, 'files')
  for (const file of Object.keys(files ?? {})) requirePath(file)
  return {
    lang: requireString(body, 'lang'),
    code: requireString(body, 'code'),
    args: stringTable(body, 'args'),
    stdin: optionalString(body, 'stdin'),
    timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
    files,
  }
}

async function handle(workspace: string, options: LocalEnvServerOptions, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const route = `${req.method} ${new URL(req.url ?? '/', 'http://localhost').pathname}`
  switch (route) {
    case 'GET /status':
      return sendJson(res, 200, await status(workspace))
    case 'POST /run': {
      const request = runRequest(await readJson(req))
      if (!findDefinition(workspace)) return sendJson(res, 200, failedContainerRun(text().noDefinition))
      const devcontainer = await readDevcontainer(workspace)
      if (!devcontainer) return sendJson(res, 200, failedContainerRun(text().unreadableDefinition))
      // Closing the connection (the client aborted) stops the container.
      const aborted = new AbortController()
      res.on('close', () => {
        if (!res.writableEnded) aborted.abort()
      })
      return sendJson(res, 200, await runInContainer(workspace, devcontainer, request, options, aborted.signal))
    }
    case 'POST /commit': {
      const body = await readJson(req)
      return sendJson(res, 200, await commitOnNewBranch(workspace, {
        file: requireString(body, 'file'),
        content: optionalString(body, 'content'),
        branch: optionalString(body, 'branch'),
        message: optionalString(body, 'message'),
      }))
    }
    case 'POST /replicate': {
      const body = await readJson(req)
      const request = { file: requireString(body, 'file'), content: requireString(body, 'content'), lang: optionalString(body, 'lang') }
      const definition = findDefinition(workspace)
      if (!definition) throw new HttpError(404, text().noDefinition)
      const { name, zip } = replicateArchive(workspace, definition, request)
      res.statusCode = 200
      res.setHeader('content-type', 'application/zip')
      res.setHeader('content-disposition', `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`)
      res.end(zip)
      return
    }
    default:
      throw new HttpError(404, text().unknownEndpoint(route))
  }
}

/**
 * The deck that a generated Slidev deck belongs to: the parent of its nearest
 * `.presmium` ancestor (`<deck>/.presmium/slides` in builds, under
 * `<deck>/.presmium/dev` in dev), else the Slidev deck's own directory.
 */
export function deckDirOf(slidevDir: string): string {
  for (let dir = resolve(slidevDir); dirname(dir) !== dir; dir = dirname(dir)) {
    if (basename(dir) === '.presmium') return dirname(dir)
  }
  return resolve(slidevDir)
}

/** Vite plugin serving the endpoints under `/__presmium/exec-local/`; dev servers only. */
export function localEnvServer(options: LocalEnvServerOptions): DevServerPlugin {
  let workspace: Promise<string> | undefined
  const resolveWorkspace = () => workspace ??= options.workspace === undefined
    ? gitRoot(options.deckDir).then(root => root ?? options.deckDir)
    : Promise.resolve(resolve(options.deckDir, options.workspace))
  return {
    name: 'presmium:exec-local',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(ENDPOINT, (req, res) => {
        // Each request is answered in the language the page asks for.
        inLanguage(req.headers['accept-language'], () => resolveWorkspace().then(dir => handle(dir, options, req, res)))
          .catch((error: unknown) => {
            if (res.headersSent) return void res.end()
            const status = error instanceof HttpError ? error.status : 500
            sendJson(res, status, { error: errorMessage(error) })
          })
      })
    },
  }
}
