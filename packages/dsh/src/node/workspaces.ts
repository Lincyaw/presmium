/**
 * The `presmium-workspaces` row, web carrier only (docs/design-dsh.md 6.2 and
 * 6.6): every document's directory is a DeepSeek Harness workspace, so a
 * session runs in a document's directory, which is also the sandbox's root and
 * the review's (definitive version, difference 7: the workspace root is not
 * registered). The first registration happens at start, before the page can
 * ask for DeepSeek Harness's first-use workspace (`initializeDefault` makes one
 * only in an empty registry; the profile patch also points the controller's
 * `documentsDirectory` into Presmium's state directory), so nothing is made
 * under `~/Documents`. The list then follows the documents: a new one is
 * registered, a retitled one renamed, the registration of one gone deleted
 * (its sessions stay, ungrouped).
 */
import { realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import type { DshContext } from './dsh.ts'

export const name = 'presmium-workspaces'
export const inject = ['presmium', 'workspaceRegistry']

/** How often the list is compared with the documents. */
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
  // Registered before the row is active: the page's first-use check finds the documents' workspaces.
  await follow()
}
