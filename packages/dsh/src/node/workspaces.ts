import { basename } from 'node:path'
import type { DshContext } from './dsh-types.ts'

export const name = 'presmium-workspaces'
export const inject = ['presmium', 'workspaceRegistry']

export async function apply(ctx: DshContext): Promise<void> {
  const { root } = await ctx.presmium.server.ready
  await ctx.workspaceRegistry.create(root, basename(root))
}
