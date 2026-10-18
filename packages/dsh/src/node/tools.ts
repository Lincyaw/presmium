/**
 * The `presmium-tools` row (decision G-3, docs/design-dsh.md section 9): the
 * DeepSeek Harness adapter of Presmium's one tool table. When an agent is
 * created, its session's document's tools, as MCP lists them to the session's
 * token, become the agent's own tools `presmium__<name>`, with the same input
 * schema; a call goes to the workspace service's `/mcp` as `tools/call`, so
 * the deck compiles and runs in the service only. The tools are registered in
 * the agent's scope (`agent.ctx`): each session has its own document's set
 * (17, item 12), and a kind whose policy is `off` is not listed, so it is not
 * registered either.
 */
import type { ListedTool } from '@presmium/mcp/client'
import type { DshAgent, DshContext, DshToolDefinition } from './dsh.ts'
import type { PresmiumSession } from './service.ts'

export const name = 'presmium-tools'
export const inject = ['presmium', 'tools']

/** The prefix of Presmium's tools among the agent's. */
export const PREFIX = 'presmium__'

function definition(session: PresmiumSession, tool: ListedTool): DshToolDefinition {
  return {
    name: `${PREFIX}${tool.name}`,
    description: tool.description,
    parameters: tool.inputSchema,
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args, exec) {
      const result = await session.client.call(tool.name, (args ?? {}) as Record<string, unknown>, exec.signal)
      if (result.isError) throw new Error(result.text)
      return result.text
    },
  }
}

export function apply(ctx: DshContext): void {
  ctx.on('agent/created', async ({ agent }: { agent: DshAgent }) => {
    const session = await ctx.presmium.attach(agent)
    if (!session) return
    for (const tool of session.tools) agent.ctx.tools.register(definition(session, tool))
  })
}
