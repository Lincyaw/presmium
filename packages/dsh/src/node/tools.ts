import type { ListedTool } from '@presmium/mcp/client'
import type { DshAgent, DshContext, DshToolDefinition } from './dsh.ts'
import type { PresmiumSession } from './service.ts'

export const name = 'presmium-tools'
export const inject = ['presmium', 'tools']

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
