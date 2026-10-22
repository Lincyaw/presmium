import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { WEB_RENDERER_PACKAGE } from '@lincyaw/kernel'
import type { IRDocument, RenderContext } from '@lincyaw/kernel'
import { findInstalledPackage } from '@lincyaw/kernel/node'

/** The directory of a package named by the deck: a path from the deck's directory, or a package installed for it. */
export function findPackageDir(name: string, deckDir: string): string | undefined {
  if (name.startsWith('.') || isAbsolute(name)) {
    const dir = resolve(deckDir, name)
    return existsSync(join(dir, 'package.json')) ? dir : undefined
  }
  return findInstalledPackage(name, resolve(deckDir))
}

export function relativePath(from: string, dir: string): string {
  const path = relative(from, dir).split('\\').join('/')
  return path.startsWith('.') ? path : `./${path}`
}

/** The web renderer's package, a Slidev addon that links each slide to the web form, when the web form is built and installed. */
function formAddons(doc: IRDocument, ctx: RenderContext): string[] {
  const { renderers } = doc.config
  if (Object.keys(renderers).length > 0 && !renderers.web) return []
  const name = typeof renderers.web?.package === 'string' ? renderers.web.package : WEB_RENDERER_PACKAGE
  return findPackageDir(name, ctx.deckDir) ? [name] : []
}

/** The deck's Slidev addons: the plugins the compiler loaded, those the slides renderer's configuration names, and the web renderer's. */
export function addonNames(doc: IRDocument, ctx: RenderContext): string[] {
  const { addons } = ctx.config
  const plugins = doc.config.plugins.filter(name => ctx.pluginDirs[name] !== undefined)
  const listed = [...plugins, ...Array.isArray(addons) ? addons : [], ...formAddons(doc, ctx)]
  return listed.filter((name): name is string => typeof name === 'string')
}

export function addonDirs(doc: IRDocument, ctx: RenderContext): string[] {
  return addonNames(doc, ctx).flatMap(name => ctx.pluginDirs[name] ?? findPackageDir(name, ctx.deckDir) ?? [])
}

/** How the headmatter names an addon: by its path from the Slidev project's directory, else by its name. */
export function addonPath(name: string, ctx: RenderContext, projectDir: string): string {
  const dir = ctx.pluginDirs[name] ?? findPackageDir(name, ctx.deckDir)
  return dir ? relativePath(dirname(projectDir), dir) : name
}
