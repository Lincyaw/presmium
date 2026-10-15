/**
 * Dev-server endpoints of the local environment, registered from
 * `setup/vite-plugins.ts` (K-09 write-back goes through here):
 *
 * - `GET  status`     what is available: Docker, devcontainer definition, git
 * - `POST run`        RunRequest -> RunResult, in the devcontainer image (P-22)
 * - `POST commit`     CommitRequest -> CommitResult, on a new branch (P-25)
 * - `POST replicate`  ReplicateRequest -> zip archive (P-26)
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { relative, resolve, sep } from 'node:path'
import type { RunRequest } from '@presmium/kernel/contracts'
import { ENDPOINT, failedRun } from '../domain/index.ts'
import type { LocalEnvStatus } from '../domain/index.ts'
import { definitionRunners, dockerAvailable, findDefinition, readDevcontainer, runInContainer } from './container.ts'
import { commitOnNewBranch, gitRoot } from './git.ts'
import { HttpError, optionalString, readJson, requireString, sendJson } from './http.ts'
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
  /** Workspace relative to the deck directory; defaults to the git root of the deck. */
  workspace?: string
}

async function status(workspace: string): Promise<LocalEnvStatus> {
  const definition = findDefinition(workspace)
  const [docker, root] = await Promise.all([dockerAvailable(), gitRoot(workspace)])
  const reasons = [
    !docker && '未找到可用的 Docker',
    !definition && '工作区没有 devcontainer 定义',
    !root && '工作区不在有提交的 git 仓库中',
  ].filter(Boolean)
  return {
    connected: true,
    docker,
    devcontainer: definition ? relative(workspace, definition).split(sep).join('/') : null,
    git: root !== undefined,
    languages: docker && definition ? Object.keys(definitionRunners(definition)) : [],
    reason: reasons.length ? reasons.join('；') : undefined,
  }
}

function runRequest(body: Record<string, unknown>): RunRequest {
  const args = body.args
  if (args !== undefined && (typeof args !== 'object' || args === null || Object.values(args).some(v => typeof v !== 'string'))) {
    throw new HttpError(400, '字段 args 必须是字符串表')
  }
  return {
    lang: requireString(body, 'lang'),
    code: requireString(body, 'code'),
    args: args as Record<string, string> | undefined,
    stdin: optionalString(body, 'stdin'),
    timeoutMs: typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined,
  }
}

async function handle(workspace: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const route = `${req.method} ${new URL(req.url ?? '/', 'http://localhost').pathname}`
  switch (route) {
    case 'GET /status':
      return sendJson(res, 200, await status(workspace))
    case 'POST /run': {
      const request = runRequest(await readJson(req))
      if (!findDefinition(workspace)) return sendJson(res, 200, failedRun('工作区没有 devcontainer 定义'))
      const devcontainer = await readDevcontainer(workspace)
      if (!devcontainer) return sendJson(res, 200, failedRun('无法读取 devcontainer 定义，请确认 Docker 可用'))
      // Closing the connection (the client aborted) stops the container.
      const aborted = new AbortController()
      res.on('close', () => {
        if (!res.writableEnded) aborted.abort()
      })
      return sendJson(res, 200, await runInContainer(workspace, devcontainer, request, aborted.signal))
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
      if (!definition) throw new HttpError(404, '工作区没有 devcontainer 定义')
      const { name, zip } = replicateArchive(workspace, definition, request)
      res.statusCode = 200
      res.setHeader('content-type', 'application/zip')
      res.setHeader('content-disposition', `attachment; filename="${name.replace(/[^\w.-]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`)
      res.end(zip)
      return
    }
    default:
      throw new HttpError(404, `未知的本地环境接口：${route}`)
  }
}

/** Vite plugin serving the endpoints under `/__presmium/exec-local/`; dev server only. */
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
        resolveWorkspace()
          .then(dir => handle(dir, req, res))
          .catch((error: unknown) => {
            if (res.headersSent) return void res.end()
            const status = error instanceof HttpError ? error.status : 500
            sendJson(res, status, { error: error instanceof Error ? error.message : String(error) })
          })
      })
    },
  }
}
