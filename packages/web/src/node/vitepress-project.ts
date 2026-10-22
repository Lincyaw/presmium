import { existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ABSOLUTE_URL } from '@lincyaw/kernel'
import { packageOf } from '@lincyaw/kernel/node'
import type { SiteShell } from '../domain/index.ts'
import type { ClientModules } from './client-modules.ts'

const WEB_DIR = fileURLToPath(new URL('../..', import.meta.url))

export const SRC_EXCLUDE = ['public/**']

export const OG_TITLE = `site.transformHead = ({ title }) => [['meta', { property: 'og:title', content: title }]]\n`

/** The root of the Presmium installation: the monorepo, or the outermost project whose `node_modules` holds this package. */
export function presmiumRoot(): string {
  const own = realpathSync(WEB_DIR)
  let outermost: string | undefined
  for (let dir = own; dirname(dir) !== dir; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir
    if (dir.split(sep).at(-1) === 'node_modules') outermost = dirname(dir)
  }
  return outermost ?? own
}

/** The directories for Vite's `server.fs.allow`, each once and by its real path. */
export function viteFsAllow(...dirs: (string | undefined)[]): string[] {
  return [...new Set(dirs.filter((dir): dir is string => Boolean(dir)).map(dir => (existsSync(dir) ? realpathSync(dir) : dir)))]
}

/** Writes the file unless it already holds the content, so that VitePress sees no change. */
export function writeIfChanged(file: string, content: string | Buffer): void {
  if (existsSync(file) && readFileSync(file).equals(Buffer.from(content))) return
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
}

/** Links the VitePress and Vue of this package into the project's `node_modules`, where the generated files resolve them. */
export function linkFrameworkPackages(root: string): void {
  const require = createRequire(import.meta.url)
  for (const name of ['vitepress', 'vue']) {
    const target = dirname(require.resolve(`${name}/package.json`))
    const link = join(root, 'node_modules', name)
    if (existsSync(link) && readlinkSync(link) === target) continue
    rmSync(link, { force: true })
    mkdirSync(dirname(link), { recursive: true })
    symlinkSync(target, link, 'junction')
  }
}

/** The directories of this package and of the packages that hold the browser modules. */
export function browserPackages(modules: ClientModules): string[] {
  const files = [...modules.plugins, ...modules.viewers.map(({ file }) => file), ...modules.components.values()]
  return [...new Set([WEB_DIR, ...files.flatMap(file => packageOf(file) ?? [])])]
}

/** Removes the page directories left from a translation the site no longer has. */
export function removeStaleLocaleDirectories(root: string, langs: ReadonlySet<string>): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && !entry.name.startsWith('.') && !['public', 'node_modules'].includes(entry.name) && !langs.has(entry.name)) rmSync(join(root, entry.name), { recursive: true, force: true })
  }
}

export function languageLabel(lang: string): string {
  const primary = lang.split('-')[0]!
  try {
    return new Intl.DisplayNames([lang], { type: 'language' }).of(primary) ?? lang
  } catch {
    return lang
  }
}

/** The URL of the site's Open Graph image: an absolute URL as written, a local file published (with the sitemap's host name when there is one). */
export function headImageUrl(shell: SiteShell, publish: (url: string) => string | undefined): string | undefined {
  const image = shell.head?.image
  if (!image || ABSOLUTE_URL.test(image)) return image
  const published = publish(image)
  return published && shell.sitemap ? `${shell.sitemap.hostname}${published}` : published
}

/** The Open Graph tags of the site's head, besides the title (`OG_TITLE`). */
export function openGraphHead(head: SiteShell['head'], image: string | undefined): unknown[] {
  if (!head) return []
  return [
    ['meta', { property: 'og:type', content: 'website' }],
    ...head.description ? [['meta', { property: 'og:description', content: head.description }]] : [],
    ...image ? [['meta', { property: 'og:image', content: image }]] : [],
  ]
}
