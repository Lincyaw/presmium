import { execFile } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { PresmiumNodePlugin } from '@presmium/kernel'
import { load } from '@slidev/parser/fs'
import { createJiti } from 'jiti'
import type { DeckSource, SlideSource } from '../domain/index.ts'

export const DECK_ENTRY = 'slides.md'
/** Package export that holds an addon's node plugin (docs/architecture.md section 3). */
const NODE_PLUGIN_EXPORT = './presmium'
/** Browser entry that registers an addon's kernel plugins in the web form (architecture section 5.1). */
const CLIENT_PLUGIN = 'src/client/plugin.ts'
const COMPONENT = /^[^.]+\.(vue|[jt]sx?)$/

/** Client modules of an addon (or of the deck itself) that the web theme registers. */
export interface ClientModules {
  /** Component name to absolute file, from the Slidev `components/` convention. */
  components: Map<string, string>
  /** Absolute paths of `src/client/plugin.ts` modules. */
  plugins: string[]
}

export interface LoadedDeck extends DeckSource {
  dir: string
  /** The deck's Markdown files, `src:` imports included. */
  files: string[]
  client: ClientModules
}

const jiti = createJiti(import.meta.url)
const run = promisify(execFile)

/** Package directory of an addon: a path relative to the deck, or a package found in node_modules. */
function findAddonDir(addon: string, deckDir: string): string | undefined {
  if (addon.startsWith('.') || isAbsolute(addon)) {
    const dir = resolve(deckDir, addon)
    return existsSync(join(dir, 'package.json')) ? dir : undefined
  }
  // Like Slidev, a bare name may omit the `slidev-addon-` prefix.
  const names = addon.startsWith('@') || addon.startsWith('slidev-addon-') ? [addon] : [`slidev-addon-${addon}`, addon]
  for (let d = deckDir; ; d = dirname(d)) {
    const dir = names.map(name => join(d, 'node_modules', name)).find(dir => existsSync(join(dir, 'package.json')))
    if (dir) return realpathSync(dir)
    if (dirname(d) === d) return undefined
  }
}

function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined
  const conditions = value as Record<string, unknown>
  return exportTarget(conditions.import) ?? exportTarget(conditions.node) ?? exportTarget(conditions.default)
}

async function loadNodePlugin(dir: string): Promise<PresmiumNodePlugin | undefined> {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { exports?: Record<string, unknown> }
  const target = exportTarget(pkg.exports?.[NODE_PLUGIN_EXPORT])
  if (!target || !existsSync(join(dir, target))) return undefined
  const plugin = await jiti.import<PresmiumNodePlugin>(join(dir, target), { default: true })
  return typeof plugin?.transformMarkdown === 'function' ? plugin : undefined
}

function collectClient(dir: string, client: ClientModules): void {
  const components = join(dir, 'components')
  if (existsSync(components)) {
    for (const file of readdirSync(components).filter(f => COMPONENT.test(f)).sort()) {
      client.components.set(file.replace(/\.[^.]+$/, ''), join(components, file))
    }
  }
  if (existsSync(join(dir, CLIENT_PLUGIN))) client.plugins.push(join(dir, CLIENT_PLUGIN))
}

/** The enclosing git work tree root, or `dir` itself when it is not inside one. */
async function workspaceRoot(dir: string): Promise<string> {
  return run('git', ['rev-parse', '--show-toplevel'], { cwd: dir }).then(({ stdout }) => resolve(stdout.trim()), () => dir)
}

/**
 * Slidev resolves snippet imports (`<<< @/x.py#region ts {2|3}`) from the deck
 * root or the slide's file, but the web pages are generated elsewhere: point them
 * at the absolute file and drop the Slidev-only options after the path.
 */
function absoluteSnippets(content: string, file: string, deckDir: string): string {
  return content.replace(/^<<<\s+(@\/|\.{1,2}\/)(\S+).*$/gm, (_, prefix: string, path: string) =>
    `<<< ${prefix === '@/' ? resolve(deckDir, path) : resolve(dirname(file), prefix, path)}`)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Parses `<deckDir>/slides.md` with the Slidev parser (following `src:` imports),
 * runs every addon's `transformMarkdown` in the document mode, and collects the
 * addons' client modules. Addon problems are reported through `warn` and skipped.
 */
export async function loadDeck(deckDir: string, warn: (message: string) => void): Promise<LoadedDeck> {
  const dir = resolve(deckDir)
  const data = await load({ roots: [dir], userRoot: dir }, join(dir, DECK_ENTRY))
  for (const md of Object.values(data.markdownFiles)) {
    for (const error of md.errors ?? []) warn(`${md.filepath}:${error.row + 1}: ${error.message}`)
  }
  const headmatter = data.headmatter as Record<string, unknown>
  const addons = Array.isArray(headmatter.addons) ? headmatter.addons.filter((a): a is string => typeof a === 'string') : []
  const client: ClientModules = { components: new Map(), plugins: [] }
  const transforms: PresmiumNodePlugin[] = []
  for (const addon of addons) {
    const addonDir = findAddonDir(addon, dir)
    if (!addonDir) {
      warn(`addon "${addon}" not found from ${dir}; skipped`)
      continue
    }
    collectClient(addonDir, client)
    try {
      const plugin = await loadNodePlugin(addonDir)
      if (plugin) transforms.push(plugin)
    } catch (error) {
      warn(`addon "${addon}": cannot load ${NODE_PLUGIN_EXPORT}: ${errorMessage(error)}`)
    }
  }
  // The deck's own components override the addons', as in Slidev.
  collectClient(dir, client)

  const root = await workspaceRoot(dir)
  const slides: SlideSource[] = []
  for (const [i, slide] of data.slides.entries()) {
    const source: SlideSource = {
      index: i + 1,
      file: slide.source.filepath,
      frontmatter: slide.frontmatter,
      content: slide.content,
      note: slide.note,
      title: slide.title,
    }
    for (const plugin of transforms) {
      try {
        source.content = await plugin.transformMarkdown!({
          content: source.content,
          file: source.file,
          slide: source.index,
          mode: 'document',
          deckDir: dir,
          workspaceRoot: root,
          headmatter,
          frontmatter: source.frontmatter,
        })
      } catch (error) {
        warn(`slide ${source.index}: ${plugin.id} transformMarkdown failed: ${errorMessage(error)}`)
      }
    }
    source.content = absoluteSnippets(source.content, source.file, dir)
    slides.push(source)
  }
  return { dir, headmatter, slides, client, files: Object.keys(data.markdownFiles) }
}
