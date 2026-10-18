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
  const selections = new WeakMap<DshAgent, () => void>()
  const registered = new WeakMap<DshAgent, { session?: PresmiumSession, dispose: (() => void)[] }>()
  const sync = async (agent: DshAgent) => {
    const session = await ctx.presmium.refresh(agent)
    const previous = registered.get(agent)
    if (previous && previous.session === session) return
    for (const dispose of previous?.dispose ?? []) dispose()
    registered.set(agent, { session, dispose: session?.tools.map(tool => agent.ctx.tools.register(definition(session, tool))) ?? [] })
  }
  ctx.on('agent/created', async ({ agent }: { agent: DshAgent }) => {
    await sync(agent)
    selections.set(agent, ctx.presmium.watchSelection(agent.session.id, { before: () => agent.whenIdle(), after: () => sync(agent) }))
  })
  ctx.on('agent/disposed', ({ agent }: { agent: DshAgent }) => { selections.get(agent)?.(); selections.delete(agent) })
  ctx.on('agent/pre-step', async ({ agent }: { agent: DshAgent }, next: () => Promise<unknown>) => {
    await sync(agent)
    return next()
  })
}
