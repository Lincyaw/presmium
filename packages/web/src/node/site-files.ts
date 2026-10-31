import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tokenize } from '@lincyaw/kernel'
import type { NodeVitePlugin, PresmiumNodePlugin, RuntimeAssets } from '@lincyaw/kernel'
import MiniSearch from 'minisearch'
import { SEARCH_FIELDS } from '../domain/index.ts'
import type { SearchDocument } from '../domain/index.ts'
import { APP_MANIFEST } from './viewer-app.ts'
import type { ViewerApp } from './viewer-app.ts'

/** Where a built site keeps the viewer app (`_app/<key>/`, below the site's path) and a document its own code. */
export { APP_DIR } from '@lincyaw/kernel'
export const CODE_DIR = '_code'
// What of a cached app a site needs: not its server-side render, nor the build's own records.
const NOT_PUBLISHED = new Set(['server', '.vite', APP_MANIFEST])

/** A name for the files below `dir` by what they hold: the same files have the same name in any checkout and on any machine. */
export function contentKey(dir: string, skip: (file: string) => boolean = () => false): string {
  const hash = createHash('sha256')
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).map(file => file.split(sep).join('/')).filter(file => !skip(file) && statSync(join(dir, file)).isFile()).sort()
  for (const file of files) hash.update(file).update('\0').update(readFileSync(join(dir, file))).update('\0')
  return hash.digest('hex').slice(0, 16)
}

const published = (file: string) => !NOT_PUBLISHED.has(file.split('/')[0]!) && !file.startsWith('.')
const appKeys = new Map<string, string>()

/** Copies the app's files a page loads into a directory of `root` named by their content, and gives that name. */
export function copyApp(app: ViewerApp, root: string): string {
  let key = appKeys.get(app.dir)
  if (!key) appKeys.set(app.dir, key = contentKey(app.dir, file => !published(file)))
  const dir = join(root, key)
  mkdirSync(dir, { recursive: true })
  for (const entry of readdirSync(app.dir)) {
    if (published(entry)) cpSync(join(app.dir, entry), join(dir, entry), { recursive: true })
  }
  return key
}

/** The run-time files of the document's plugins (`PresmiumNodePlugin.assets`), for their configuration of the plugins. */
export async function runtimeAssets(nodePlugins: readonly NodeVitePlugin[], deck: { deckDir: string, workspaceRoot: string }): Promise<RuntimeAssets[]> {
  const all: RuntimeAssets[] = []
  for (const { entry, config } of nodePlugins) {
    const plugin = (await import(pathToFileURL(entry).href) as { default?: PresmiumNodePlugin }).default
    all.push(...plugin?.assets?.({ ...deck, config }) ?? [])
  }
  return all
}

/** Copies the run-time files a build takes (`emitted`, else all) below `dir`. */
export function copyRuntimeAssets(assets: readonly RuntimeAssets[], dir: string): void {
  for (const asset of assets) {
    for (const file of asset.emitted ?? Object.keys(asset.types)) {
      const target = join(dir, asset.prefix, file)
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(asset.source(file), target)
    }
  }
}

/** The run-time file at `path` below the document's site path, with its type, if a plugin serves one there. */
export function findRuntimeAsset(assets: readonly RuntimeAssets[], path: string): { file: string, type: string } | undefined {
  for (const asset of assets) {
    if (!path.startsWith(asset.prefix)) continue
    const name = path.slice(asset.prefix.length)
    if (Object.hasOwn(asset.types, name)) return { file: asset.source(name), type: asset.types[name]! }
  }
  return undefined
}

/** Copies the document's `public/` directory (files it links by their site path) into `dir`. */
export function copyPublic(deckDir: string, dir: string): void {
  const own = join(deckDir, 'public')
  if (existsSync(own) && statSync(own).isDirectory()) cpSync(own, dir, { recursive: true })
}

/** The search index of a document's sections (MiniSearch's JSON), the words of Chinese text found as the reader types them. */
export function searchIndex(documents: readonly SearchDocument[]): string {
  const index = new MiniSearch<SearchDocument>({ ...SEARCH_FIELDS, tokenize })
  index.addAll([...documents])
  return JSON.stringify(index)
}

/** The response header a dev server gives an IR's revision in (the page compares the changes it is told of with it). */
export const REVISION_HEADER = 'Presmium-Revision'
