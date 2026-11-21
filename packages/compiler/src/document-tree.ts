import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { DOCUMENT_ENTRY, documentTree, effectiveSettings, isRecord, ranksAfter, withEffectiveSettings } from '@lincyaw/kernel'
import type { DocumentDefaults, DocumentPlacement, DocumentTree, DocumentTreeNode, EffectiveDocument, PresmiumDocument } from '@lincyaw/kernel'
import { findWorkspaceRoot } from './workspace.ts'
import { WORKSPACE_CONFIG, workspaceSettings } from './workspace-settings.ts'

/** Folders discovery never enters; `locales/<lang>/` holds translations, which are not tree nodes. */
const SKIPPED = new Set(['node_modules', '.git', '.presmium', 'dist', '.trash'])

/** One discovered entry file and what the tree needs from it, read without validating the whole document. */
export interface ScannedDocument extends DocumentTreeNode {
  /** The schema version the file declares; an older one needs `presmium migrate`. */
  schemaVersion: unknown
  /** Why the file could not be read as a document. */
  problem?: string
}

export interface WorkspaceDocuments {
  root: string
  defaults: DocumentDefaults
  /** The workspace file still lists `documents:`. */
  needsMigration: boolean
  documents: ScannedDocument[]
  tree: DocumentTree
}

interface Read { mtimeMs: number, size: number, value: unknown }
const reads = new Map<string, Read>()

/** The parsed entry, cached until the file changes. */
function readEntry(file: string): unknown {
  const stat = statSync(file)
  const known = reads.get(file)
  if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) return known.value
  let value: unknown
  try { value = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) } catch (error) { value = error instanceof Error ? error : new Error(String(error)) }
  reads.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, value })
  return value
}

/** Every workspace-relative entry file under `root`, in path order. */
export function discoverDocumentEntries(root: string): string[] {
  const found: string[] = []
  // A folder reached twice through symbolic links holds its documents once, at the first path.
  const seen = new Set<string>()
  const walk = (dir: string, rel: string) => {
    let names: string[]
    try { const real = realpathSync(dir); if (seen.has(real)) return; seen.add(real); names = readdirSync(dir).sort() } catch { return }
    for (const name of names) {
      if (SKIPPED.has(name) || (name.startsWith('.') && name !== DOCUMENT_ENTRY)) continue
      const path = join(dir, name), next = rel ? `${rel}/${name}` : name
      let stat
      try { stat = statSync(path) } catch { continue }
      if (stat.isDirectory()) { if (name !== 'locales') walk(path, next) }
      else if (name === DOCUMENT_ENTRY && stat.isFile()) found.push(next)
    }
  }
  walk(root, '')
  return found
}

const placementOf = (value: Record<string, unknown>): DocumentPlacement => {
  const placement = isRecord(value.placement) ? value.placement : {}
  return { parent: typeof placement.parent === 'string' ? placement.parent : null, rank: typeof placement.rank === 'string' ? placement.rank : '' }
}

function scan(root: string, path: string): ScannedDocument {
  const value = readEntry(join(root, path))
  const fallbackTitle = path.split('/').slice(0, -1).join('/') || path
  if (!isRecord(value) || typeof value.id !== 'string') return { id: `path:${path}`, path, title: fallbackTitle, placement: { parent: null, rank: '' }, schemaVersion: isRecord(value) ? value.schemaVersion : undefined, problem: value instanceof Error ? value.message : 'not a document' }
  const metadata = isRecord(value.metadata) ? value.metadata : {}
  return { id: value.id, path, title: typeof metadata.title === 'string' && metadata.title.trim() ? metadata.title.trim() : fallbackTitle, placement: placementOf(value), schemaVersion: value.schemaVersion }
}

/** Every document of the workspace at `root` and the tree their placements make. Cheap to repeat: files are cached until they change. */
export function workspaceDocuments(root: string): WorkspaceDocuments {
  const settings = workspaceSettings(root)
  const documents = discoverDocumentEntries(root).map(path => scan(root, path))
  return { root, defaults: settings.defaults, needsMigration: Boolean(settings.needsMigration), documents, tree: documentTree(documents) }
}

const real = (path: string) => { try { return realpathSync(path) } catch { return resolve(path) } }

/** The workspace root for a document: the nearest folder above it with a workspace file, otherwise the document's own folder. */
export async function documentWorkspaceRoot(entry: string): Promise<string> {
  const found = await findWorkspaceRoot(dirname(entry))
  return existsSync(join(found, WORKSPACE_CONFIG)) ? found : dirname(entry)
}

/** The original a translation follows in the tree, or the document itself. */
function treeEntry(entry: string, document: PresmiumDocument): string {
  const original = document.metadata.translationOf?.entry
  return original ? resolve(dirname(entry), original) : entry
}

/** The document's ancestors (root first, parent last) and the workspace `defaults` at the root of its settings. */
function inheritance(root: string, entry: string, document: PresmiumDocument): { ancestors: PresmiumDocument[], defaults: DocumentDefaults } {
  const { defaults } = workspaceSettings(root)
  const own = treeEntry(entry, document)
  const placement = own === entry ? document.placement : (() => { const value = existsSync(own) ? readEntry(own) : undefined; return isRecord(value) ? placementOf(value) : document.placement })()
  if (placement.parent === null) return { ancestors: [], defaults }
  const { tree } = workspaceDocuments(root)
  const rel = relative(real(root), real(own)).split(sep).join('/')
  const id = tree.byId.get(document.id)?.path === rel ? document.id : [...tree.byId.values()].find(node => node.path === rel)?.id
  const ancestors = (id === undefined ? [] : tree.ancestors(id)).flatMap((node) => {
    const value = readEntry(join(root, node.path))
    return isRecord(value) && isRecord(value.metadata) && isRecord(value.production) ? [value as unknown as PresmiumDocument] : []
  })
  return { ancestors, defaults }
}

/**
 * The document with its inherited settings: workspace `defaults` → root ancestor → … → parent → itself. `entry` is
 * the document's file, `root` the workspace it belongs to; a document outside every workspace has no ancestors.
 * Ancestors are found by ID through the workspace scan; ancestors that cannot be read are skipped.
 */
export function effectiveDocumentIn(root: string, entry: string, document: PresmiumDocument): EffectiveDocument {
  const { ancestors, defaults } = inheritance(root, entry, document)
  return withEffectiveSettings(document, ancestors, defaults)
}

/** What the document inherits, without its own settings: an editor fills it in with `withInheritedSettings` as the author edits. */
export function inheritedSettingsIn(root: string, entry: string, document: PresmiumDocument): DocumentDefaults {
  const { ancestors, defaults } = inheritance(root, entry, document)
  const { lang: _lang, ...merged } = effectiveSettings(ancestors, defaults)
  const lang = [defaults.lang, ...ancestors.map(ancestor => ancestor.metadata.lang)].filter((value): value is string => typeof value === 'string').at(-1)
  return { ...merged, ...lang !== undefined ? { lang } : {} }
}

/** `effectiveDocumentIn` for a document whose workspace is found upward from its file, as the compiler finds it. */
export async function effectiveDocument(entry: string, document: PresmiumDocument, options: { workspaceRoot?: string } = {}): Promise<EffectiveDocument> {
  const file = resolve(entry)
  return effectiveDocumentIn(options.workspaceRoot ? resolve(options.workspaceRoot) : await documentWorkspaceRoot(file), file, document)
}

/** Ranks for `count` new documents placed at the top level of the workspace at `root`, after the last one there. */
export function topLevelRanks(root: string, count: number): string[] {
  const top = workspaceDocuments(root).tree.children.get(null) ?? []
  const last = top.length ? workspaceDocuments(root).tree.byId.get(top.at(-1)!)!.placement.rank || null : null
  return ranksAfter(last, count)
}
