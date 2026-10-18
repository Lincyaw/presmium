import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { DshContext } from './dsh.ts'

export const name = 'presmium-workspaces'
export const inject = ['presmium', 'workspaceRegistry']

const FOLLOW_MS = 3000

function real(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return resolve(path)
  }
}

export async function apply(ctx: DshContext): Promise<void> {
  const registry = ctx.workspaceRegistry
  const log = ctx.logger?.('presmium') ?? console
  const sync = async () => {
    const { root } = await ctx.presmium.ready
    const documents = await ctx.presmium.documents()
    const wanted = new Map(documents.map(doc => [real(resolve(root, doc.dir)), doc]))
    const known = registry.list()
    for (const [path, doc] of wanted) {
      const found = known.find(workspace => real(workspace.path) === path)
      if (!found) await registry.create(path, doc.title)
      else if (found.title !== doc.title) await found.setTitle(doc.title)
    }
    const top = real(root)
    for (const workspace of known) {
      const rel = relative(top, real(workspace.path))
      const under = !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel)
      if (under && !wanted.has(real(workspace.path))) await registry.delete(workspace.id)
    }
  }
  let running: Promise<void> | undefined
  const follow = () => {
    running ??= sync().catch((error: unknown) => log.warn(`presmium-workspaces: ${error instanceof Error ? error.message : String(error)}`)).finally(() => running = undefined)
    return running
  }
  const timer = setInterval(follow, FOLLOW_MS)
  timer.unref()
  ctx.effect(() => () => clearInterval(timer))
  await follow()
}
