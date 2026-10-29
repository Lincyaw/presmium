import { createMcpHandler, fromJsonSchema, McpServer } from '@modelcontextprotocol/server'
import type { JsonSchemaType } from '@modelcontextprotocol/server'

export interface RemoteMcpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  readOnly: boolean
  idempotent?: boolean
  run(arguments_: Record<string, unknown>, signal: AbortSignal): Promise<unknown>
}
export interface RemoteMcpToolOptions {
  name: string
  version: string
  maxResponseBytes?: number
  failure?(error: unknown): { code: string, status?: number, details?: Record<string, unknown> }
}
export interface RemoteMcpToolHandler {
  fetch(request: Request): Promise<Response>
  close(): Promise<void>
}

/** A stateless protocol adapter. Authentication, tenancy and durable transactions belong to its host. */
export function createMcpToolHandler(tools: readonly RemoteMcpTool[], options: RemoteMcpToolOptions): RemoteMcpToolHandler {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: options.name, version: options.version })
    for (const tool of tools) {
      server.registerTool(tool.name, {
        description: tool.description,
        inputSchema: fromJsonSchema<Record<string, unknown>>(tool.inputSchema as JsonSchemaType),
        annotations: { readOnlyHint: tool.readOnly, ...tool.idempotent !== undefined ? { idempotentHint: tool.idempotent } : {} },
      }, async (arguments_, context) => {
        try {
          context.mcpReq.signal.throwIfAborted()
          const result = await tool.run(arguments_, context.mcpReq.signal)
          const structured = result !== null && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : { value: result }
          const text = JSON.stringify(structured)
          if (new TextEncoder().encode(text).length > (options.maxResponseBytes ?? 4 << 20)) {
            const failure = { error: { code: 'response-too-large', status: 413 } }
            return { isError: true, content: [{ type: 'text', text: JSON.stringify(failure) }], structuredContent: failure }
          }
          return { content: [{ type: 'text', text }], structuredContent: structured }
        } catch (error) {
          // Never expose arbitrary provider/SQL/credential-bearing exception messages to the caller.
          const failure = { error: options.failure?.(error) ?? { code: 'tool-failed' } }
          return { isError: true, content: [{ type: 'text', text: JSON.stringify(failure) }], structuredContent: failure }
        }
      })
    }
    return server
  })
  return { fetch: request => handler.fetch(request), close: () => handler.close() }
}
