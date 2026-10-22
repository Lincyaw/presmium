import type { ListedTool } from '@lincyaw/mcp/client'
import type { DshAgent, DshContext, DshToolDefinition } from './dsh-types.ts'
import type { DocumentBinding } from './bindings.ts'

export const name = 'presmium-tools'
export const inject = ['presmium', 'tools']

export const PREFIX = 'presmium__'

function definition(binding: DocumentBinding, tool: ListedTool): DshToolDefinition {
  return {
    name: `${PREFIX}${tool.name}`,
    description: tool.description,
    parameters: tool.inputSchema,
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: String(value) }] },
    async execute(args, exec) {
      const result = await binding.client.call(tool.name, (args ?? {}) as Record<string, unknown>, exec.signal)
      if (result.isError) throw new Error(result.text)
      return result.text
    },
  }
}

export function apply(ctx: DshContext): void {
  const selections = new WeakMap<DshAgent, () => void>()
  const registered = new WeakMap<DshAgent, { binding?: DocumentBinding, dispose: (() => void)[] }>()
  const sync = async (agent: DshAgent) => {
    const binding = await ctx.presmium.bindings.syncBinding(agent)
    const previous = registered.get(agent)
    if (previous && previous.binding === binding) return
    for (const dispose of previous?.dispose ?? []) dispose()
    registered.set(agent, { binding, dispose: binding?.tools.map(tool => agent.ctx.tools.register(definition(binding, tool))) ?? [] })
  }
  ctx.on('agent/created', async ({ agent }: { agent: DshAgent }) => {
    await sync(agent)
    selections.set(agent, ctx.presmium.bindings.watchSelection(agent.session.id, { before: () => agent.whenIdle(), after: () => sync(agent) }))
  })
  ctx.on('agent/disposed', ({ agent }: { agent: DshAgent }) => { selections.get(agent)?.(); selections.delete(agent) })
  ctx.on('agent/pre-step', async ({ agent }: { agent: DshAgent }, next: () => Promise<unknown>) => {
    await sync(agent)
    return next()
  })
}
