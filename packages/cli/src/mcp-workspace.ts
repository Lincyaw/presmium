import { existsSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { findWorkspaceRoot, WORKSPACE_CONFIG } from '@lincyaw/compiler'
import { findWorkspaceServiceState, readServiceState, serveStateDir, tryAcquireServiceHostLease } from '@lincyaw/kernel/node'
import type { ApprovalKind } from '@lincyaw/kernel'
import type { ServiceHostLease, ServiceState } from '@lincyaw/kernel/node'
import { serveWorkspace } from '@lincyaw/workspace'
import type { WorkspaceServer } from '@lincyaw/workspace'

interface WorkspaceTarget { mcp: string, token: string, pid: number }
export interface McpWorkspaceConnection { target: WorkspaceTarget, close(): Promise<void> }

/** One stdio session may own the shared host; every other session borrows its published endpoint. */
export function mcpWorkspaceSession(bundled: string) {
  let root: Promise<string> | undefined, owned: { server: WorkspaceServer, lease: ServiceHostLease } | undefined
  let closed = false, pending: Promise<McpWorkspaceConnection> | undefined, closing: Promise<void> | undefined
  const closeOwned = async () => {
    const current = owned
    owned = undefined
    await current?.server.close()
  }
  const close = (): Promise<void> => closing ??= Promise.resolve().then(async () => {
    closed = true
    await pending?.catch(() => undefined)
    await closeOwned()
  })
  const target = (state: ServiceState): WorkspaceTarget => ({ mcp: state.mcp, token: state.token, pid: state.pid })
  return {
    startWorkspace(dir: string, allow: readonly ApprovalKind[], signal: AbortSignal): Promise<McpWorkspaceConnection> {
      if (pending) return pending
      const work = async () => {
        signal.throwIfAborted()
        if (closed) throw new Error('mcp-workspace-session-closed')
        if (!root) {
          const existing = findWorkspaceServiceState(dir)
          root = existing ? Promise.resolve(existing.root) : findWorkspaceRoot(dir).then(found => realpathSync(existsSync(join(found, WORKSPACE_CONFIG)) ? found : dir))
        }
        const directory = await root, file = join(serveStateDir(directory), 'server.json')
        const deadline = Date.now() + 30_000
        for (;;) {
          signal.throwIfAborted()
          if (closed) throw new Error('mcp-workspace-session-closed')
          if (owned?.lease.signal.aborted) await closeOwned()
          const state = readServiceState(file)
          if (state) return { target: target(state), close }
          if (Date.now() >= deadline) throw new Error('mcp-workspace-start-timeout')
          const lease = await tryAcquireServiceHostLease(directory)
          if (!lease) { await delay(100, undefined, { signal }); continue }
          // A previous host may have published while this process was waiting for its lease.
          const appeared = readServiceState(file)
          if (appeared) { await lease.release(); return { target: target(appeared), close } }
          let server: WorkspaceServer | undefined
          const startup = AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, deadline - Date.now()))])
          try {
            signal.throwIfAborted()
            server = await serveWorkspace({ dir: directory, bundled, port: 0, listenAddress: '127.0.0.1', allow: [...allow], hostLease: lease, signal: startup })
            startup.throwIfAborted()
            if (closed) throw new Error('mcp-workspace-session-closed')
            const ready = readServiceState(file)
            if (!ready || ready.pid !== process.pid || ready.mcp !== server.mcp.url) throw new Error('mcp-workspace-state-unavailable')
            owned = { server, lease }
            return { target: target(ready), close }
          } catch (error) {
            if (server) await server.close()
            else await lease.release()
            if (!signal.aborted && startup.aborted) throw new Error('mcp-workspace-start-timeout')
            throw error
          }
        }
      }
      pending = work().finally(() => { pending = undefined })
      return pending
    },
    close,
  }
}
