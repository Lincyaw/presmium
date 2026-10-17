/**
 * The deltabox plugin (D12, D13; docs/architecture.md 10.6, 10.7): an
 * operator plugin installed with the CLI, which the compiler loads in every
 * command without the workspace listing it. Where the host qualifies (Linux
 * x64 or arm64, glibc 2.39, deltabox's binding, a cbcow-through session
 * started strictly, no degraded protection) it provides `PROCESS_SANDBOX`,
 * through which the exec plugin runs compile-time code, and `CHANGE_REVIEW`,
 * through which the assistant reviews an agent's changes. deltabox's binding
 * is loaded only in the plugin's helper process (./helper.ts).
 *
 * The operator's `settings.presmium.deltabox`: `sandbox` and `review` (both
 * on unless `false`), `read` (more read-only paths for the process sandbox,
 * `~/` for the home directory) and `stateDir` (deltabox's session state and
 * the review snapshots; outside every workspace, by default in the user's
 * state directory). A service left out is named in the startup log with its
 * reason, and a build whose code runs without the sandbox says why.
 */
import { realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { CHANGE_REVIEW, PROCESS_SANDBOX, docBlocks } from '@presmium/kernel'
import type { IRPass, NodeServiceContext, PresmiumNodePlugin, ServiceToken } from '@presmium/kernel'
import { helperFor, probe } from './client.ts'
import { messages } from './messages.ts'
import { deltaboxReviews } from './review.ts'
import { deltaboxSandbox } from './sandbox.ts'

const { version } = createRequire(import.meta.url)('../../package.json') as { version: string }

export const DELTABOX_ID = 'presmium.deltabox'

interface DeltaboxSettings {
  review: boolean
  sandbox: boolean
  read: string[]
  stateDir: string
}

const home = (path: string) => path === '~' || path.startsWith('~/') ? join(homedir(), path.slice(1)) : path

function deltaboxSettings(settings: Record<string, unknown>, workspaceRoot: string): DeltaboxSettings {
  const read = Array.isArray(settings.read) ? settings.read.filter((p): p is string => typeof p === 'string' && p !== '') : []
  const state = process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state')
  return {
    review: settings.review !== false,
    sandbox: settings.sandbox !== false,
    read: read.map(p => resolve(workspaceRoot, home(p))),
    stateDir: typeof settings.stateDir === 'string' && settings.stateDir ? resolve(workspaceRoot, home(settings.stateDir)) : join(state, 'presmium', 'deltabox'),
  }
}

const real = (path: string) => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/** Why each deck's compile-time code runs without the process sandbox (LOCAL mode), for its build report. */
const unsandboxed = new Map<string, string>()
/** Startup log lines already written by this process. */
const logged = new Set<string>()

function logOnce(ctx: NodeServiceContext, line: string): void {
  if (logged.has(line)) return
  logged.add(line)
  ctx.log.info(line)
}

/** Whether the host qualifies, with the state directory outside the workspace; asked once per process. */
function availability(ctx: NodeServiceContext, settings: DeltaboxSettings): { ok: true, kind: string } | { ok: false, reason: string } {
  const t = messages(ctx.lang)
  const fromRoot = relative(real(ctx.workspaceRoot), real(settings.stateDir))
  // Inside the workspace root (a directory named `..state` is inside it, F-11).
  if (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot)) return { ok: false, reason: t.stateInside(settings.stateDir) }
  const found = probe(settings.stateDir, ctx.log)
  if (found.recovered?.length) logOnce(ctx, t.recovered(found.recovered))
  return found.ok ? { ok: true, kind: found.kind } : { ok: false, reason: t.unqualified(found) }
}

function services(ctx: NodeServiceContext): [ServiceToken<unknown>, unknown][] {
  const settings = deltaboxSettings(ctx.settings, ctx.workspaceRoot)
  const t = messages(ctx.lang)
  const host = settings.sandbox || settings.review ? availability(ctx, settings) : undefined
  const why = (enabled: boolean, off: string): string | undefined => !enabled ? off : host?.ok ? undefined : host?.reason
  const noSandbox = why(settings.sandbox, t.sandboxOff)
  const noReview = why(settings.review, t.reviewOff)
  const entries: [ServiceToken<unknown>, unknown][] = []
  if (host?.ok) {
    const helper = helperFor(settings.stateDir, ctx.log)
    if (!noSandbox) entries.push([PROCESS_SANDBOX, deltaboxSandbox(helper, host.kind, [ctx.deckDir, ...settings.read])])
    if (!noReview) entries.push([CHANGE_REVIEW, deltaboxReviews(helper, ctx.workspaceRoot, ctx.lang)])
  }
  if (noSandbox) logOnce(ctx, t.noSandbox(noSandbox))
  if (noReview) logOnce(ctx, t.noReview(noReview))
  if (noSandbox && ctx.trust === 'local') unsandboxed.set(ctx.deckDir, noSandbox)
  else unsandboxed.delete(ctx.deckDir)
  return entries
}

/** The build report says why compile-time code ran without the process sandbox (when no other plugin provides one). */
const reportPass: IRPass = {
  name: 'presmium.deltabox.report',
  after: 'execute',
  run(doc, ctx) {
    const reason = unsandboxed.get(ctx.deckDir)
    if (!reason || ctx.service?.(PROCESS_SANDBOX)) return
    for (const { block } of docBlocks(doc)) {
      if (block.node.type !== 'code' || !block.node.run || block.node.run.when === 'live') continue
      const t = messages(ctx.lang)
      ctx.report({ checkId: DELTABOX_ID, severity: 'info', message: t.notIsolated(reason), hint: t.enable, source: { file: block.source.file, line: block.source.line } })
      return
    }
  },
}

const plugin: PresmiumNodePlugin = {
  id: DELTABOX_ID,
  version,
  kernel: '^0.1.0',
  operator: true,
  services,
  passes: [reportPass],
}

export default plugin
