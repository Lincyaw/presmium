import { randomBytes } from 'node:crypto'
import { LOCAL_AUTHOR } from '@lincyaw/kernel'
import type { McpEndpoint, McpGrant } from '@lincyaw/kernel'
import type { McpCaller } from '@lincyaw/mcp'

function endedBy(response: Response, signal: AbortSignal, done: () => void): Response {
  if (!response.body) {
    done()
    return response
  }
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
  void response.body.pipeTo(writable, { signal, preventAbort: true })
    .catch(() => writable.close().catch(() => undefined))
    .finally(done)
  return new Response(readable, { status: response.status, statusText: response.statusText, headers: response.headers })
}

/**
 * The tokens that open /mcp: this process's own (written to its state file), the grants MCP_ENDPOINT issues,
 * and the grants the launcher asks for its agent sessions. Revoking a grant ends the event streams it opened.
 */
export class McpTokens {
  readonly processMcpToken = randomBytes(24).toString('base64url')
  readonly endpoint: McpEndpoint
  readonly #callers = new Map<string, McpCaller>()
  readonly #streams = new Map<string, Set<AbortController>>()
  readonly #agentSessionGrants = new Map<string, McpGrant>()

  constructor(serverUrl: () => string) {
    this.endpoint = {
      issue: (member, mode, issued = {}) => {
        const mcpToken = randomBytes(24).toString('base64url')
        this.#callers.set(mcpToken, { member, mode, ...issued.confirmed ? { confirmed: true } : {}, ...issued.document !== undefined ? { document: issued.document } : {} })
        return { url: `${serverUrl()}/mcp`, token: mcpToken, revoke: () => this.#revoke(mcpToken) }
      },
    }
  }

  callerOf(mcpToken: string | undefined): McpCaller | undefined {
    if (mcpToken === undefined) return undefined
    return mcpToken === this.processMcpToken ? { member: LOCAL_AUTHOR, mode: 'author' } : this.#callers.get(mcpToken)
  }

  /** Ties an event stream to the grant that opened it, so that revoking the grant ends the stream. */
  tieToGrant(mcpToken: string, response: Response): Response {
    if (mcpToken === this.processMcpToken || !response.headers.get('content-type')?.startsWith('text/event-stream')) return response
    if (!this.#callers.has(mcpToken)) return endedBy(response, AbortSignal.abort(), () => {})
    const stream = new AbortController()
    const open = this.#streams.get(mcpToken) ?? new Set()
    this.#streams.set(mcpToken, open.add(stream))
    return endedBy(response, stream.signal, () => open.delete(stream))
  }

  grantAgentSession(session: string, document: string): McpGrant {
    this.#agentSessionGrants.get(session)?.revoke()
    const grant = this.endpoint.issue(LOCAL_AUTHOR, 'author', { confirmed: true, document })
    this.#agentSessionGrants.set(session, grant)
    return grant
  }

  /** Revokes the grant of one agent session, or of every one; returns how many it revoked. */
  revokeAgentSessions(session?: string): number {
    const revoked = session === undefined ? [...this.#agentSessionGrants.keys()] : this.#agentSessionGrants.has(session) ? [session] : []
    for (const id of revoked) {
      this.#agentSessionGrants.get(id)!.revoke()
      this.#agentSessionGrants.delete(id)
    }
    return revoked.length
  }

  #revoke(mcpToken: string): void {
    this.#callers.delete(mcpToken)
    for (const stream of this.#streams.get(mcpToken) ?? []) stream.abort()
    this.#streams.delete(mcpToken)
  }
}
