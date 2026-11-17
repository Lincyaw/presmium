import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { setTimeout as delay } from 'node:timers/promises'
import type { ChildProcess } from 'node:child_process'
import { findWorkspaceRoot, WORKSPACE_CONFIG } from '@lincyaw/compiler'
import { compareServiceVersion, findWorkspaceServiceState, readServiceState, serveStateDir, SERVICE_VERSION, ServiceUpgradeError, spawnInteractiveNode, upgradeWorkspaceService } from '@lincyaw/kernel/node'
import type { ApprovalKind } from '@lincyaw/kernel'
import type { ServiceState } from '@lincyaw/kernel/node'
import { CLI_MESSAGES, systemLocale } from './messages.ts'

interface WorkspaceTarget { mcp: string, token: string, pid: number }
export interface McpWorkspaceConnection { target: WorkspaceTarget, close(): Promise<void> }
interface OwnedHost { child: ChildProcess, exited: Promise<void> }

/** Stdio relays survive host upgrades. Each elected host loads its installation in a fresh Node process. */
export function mcpWorkspaceSession(bundled: string) {
  let root: Promise<string> | undefined, owned: OwnedHost | undefined
  let minimumVersion = SERVICE_VERSION
  let closed = false, pending: Promise<McpWorkspaceConnection> | undefined, closing: Promise<void> | undefined
  const stopped = new AbortController()
  const closeOwned = async () => {
    const current = owned
    owned = undefined
    if (!current) return
    current.child.stdin?.end()
    await Promise.race([current.exited, delay(8000, undefined, { ref: false })])
    if (current.child.exitCode === null && current.child.signalCode === null) current.child.kill()
    await current.exited
  }
  const close = (): Promise<void> => closing ??= Promise.resolve().then(async () => {
    closed = true
    stopped.abort()
    await pending?.catch(() => undefined)
    await closeOwned()
  })
  const target = (state: ServiceState): WorkspaceTarget => {
    if (state.version && compareServiceVersion(state, minimumVersion) > 0) minimumVersion = state.version
    return { mcp: state.mcp, token: state.token, pid: state.pid }
  }
  const installation = () => {
    let installed: { version: string, bin: { presmium: string } } | undefined
    try { installed = JSON.parse(readFileSync(join(bundled, 'package.json'), 'utf8')) } catch {}
    const version = installed && compareServiceVersion({ version: installed.version }, minimumVersion) > 0 ? installed.version : minimumVersion
    return { installed, version }
  }
  return {
    locateWorkspace(dir: string): WorkspaceTarget | undefined {
      const found = findWorkspaceServiceState(dir)
      return found && compareServiceVersion(found.state, installation().version) >= 0 ? target(found.state) : undefined
    },
    startWorkspace(dir: string, allow: readonly ApprovalKind[], signal: AbortSignal): Promise<McpWorkspaceConnection> {
      if (pending) return pending
      const work = async () => {
        const startup = AbortSignal.any([signal, stopped.signal, AbortSignal.timeout(30_000)])
        startup.throwIfAborted()
        if (closed) throw new Error('mcp-workspace-session-closed')
        if (!root) {
          const existing = findWorkspaceServiceState(dir)
          root = existing ? Promise.resolve(existing.root) : findWorkspaceRoot(dir).then(found => realpathSync(existsSync(join(found, WORKSPACE_CONFIG)) ? found : dir))
        }
        const directory = await root, file = join(serveStateDir(directory), 'server.json')
        let launchError: Error | undefined
        for (;;) {
          startup.throwIfAborted()
          if (closed) throw new Error('mcp-workspace-session-closed')
          // Read the installed command again: a long-lived relay must not restart its cached, older modules.
          const { installed, version } = installation()
          const state = readServiceState(file)
          if (state && compareServiceVersion(state, version) >= 0) return { target: target(state), close }
          if (state) { await upgradeWorkspaceService(directory, state, version, process.env, startup); continue }
          if (!installed) throw new ServiceUpgradeError('unavailable')
          if (launchError) throw launchError
          if (!owned && compareServiceVersion({ version: installed.version }, version) === 0) {
            const env: NodeJS.ProcessEnv = { ...process.env, PRESMIUM_SERVICE_PARENT_PIPE: '1' }
            delete env.PRESMIUM_STUDIO_PARENT_PIPE
            const child = spawnInteractiveNode(join(bundled, installed.bin.presmium), ['serve', directory, '--port', '0', ...allow.length ? ['--allow', allow.join(',')] : []], { cwd: directory, env, stdio: ['pipe', 'pipe', 'pipe'] })
            const lines = createInterface({ input: child.stdout! })
            lines.on('line', line => {
              if (line.startsWith('service-upgrade  ')) {
                const next = line.slice('service-upgrade  '.length)
                try { if (compareServiceVersion({ version: next }, minimumVersion) > 0) minimumVersion = next } catch {}
              }
            })
            child.stderr?.on('data', bytes => process.stderr.write(bytes))
            const current: OwnedHost = { child, exited: new Promise<void>(done => {
              child.once('error', error => { launchError = error; done() })
              child.once('exit', () => { if (owned === current) owned = undefined; lines.close(); done() })
            }) }
            owned = current
          }
          await delay(100, undefined, { signal: startup })
        }
      }
      pending = work().catch(error => {
        if (error instanceof ServiceUpgradeError) throw new Error(CLI_MESSAGES[systemLocale()].workspaceServiceUpgrade(error.reason, error.version))
        throw error
      }).finally(() => { pending = undefined })
      return pending
    },
    close,
  }
}
