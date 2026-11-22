import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { effectiveDocumentIn, providedDocuments, inheritedSettingsIn, settingOriginsIn, WORKSPACE_CONFIG, workspaceDefaults, workspaceDocuments, workspaceSettings } from '@lincyaw/compiler'
import type { OperatorSettings, WorkspaceDocuments } from '@lincyaw/compiler'
import { APPROVAL_KINDS, DOCUMENT_ENTRY, errorMessage, isRecord } from '@lincyaw/kernel'
import type { ApprovalKind, DocumentDefaults, DocumentSummary, EffectiveDocument, PresmiumDocument, SettingOrigins } from '@lincyaw/kernel'
import type { ApprovalPolicy } from '@lincyaw/server'
import { parse as parseYaml } from 'yaml'

const SKIPPED = new Set(['node_modules', '.git', '.presmium', 'dist', '.trash'])

const POLICIES = new Set<ApprovalPolicy>(['off', 'ask', 'allow'])

export interface WorkspaceConfig {
  root: string
  title: string
  /** A folder whose own entry file is the only document. */
  singleDeck: boolean
  site: Record<string, unknown>
  approvals: Partial<Record<ApprovalKind, ApprovalPolicy>>
  templates?: string
  settings: OperatorSettings
  /** The root of the documents' inherited settings. */
  defaults: DocumentDefaults
  /** The workspace file still lists `documents:`; `presmium migrate` or Studio's Upgrade removes it. */
  needsMigration: boolean
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map(v => v.trim()) : typeof value === 'string' && value.trim() ? [value.trim()] : []
}

export function readWorkspaceConfig(root: string): WorkspaceConfig {
  const dir = realpathSync(resolve(root))
  const file = join(dir, WORKSPACE_CONFIG)
  let data: Record<string, unknown> = {}
  if (existsSync(file)) {
    try {
      const parsed: unknown = parseYaml(readFileSync(file, 'utf8'))
      data = isRecord(parsed) ? parsed : {}
    } catch (error) {
      throw new Error(`${file}: ${errorMessage(error)}`)
    }
  }
  const singleDeck = existsSync(join(dir, DOCUMENT_ENTRY))
  const approvals = isRecord(data.approvals) ? data.approvals : {}
  const settings = isRecord(data.settings) ? data.settings : {}
  const renderers = isRecord(data.renderers) ? data.renderers : {}
  for (const [path, value] of [['renderers.lecture', renderers.lecture], ['settings.presmium.lecture', settings['presmium.lecture']]] as const) {
    if (isRecord(value) && Object.hasOwn(value, 'script')) throw new Error(`${file}: ${path}.script: External lecture scripts are not supported. Author narration in each document's narrations.`)
  }
  return {
    root: dir,
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : dir.split('/').at(-1) ?? 'Presmium',
    singleDeck,
    site: isRecord(data.site) ? data.site : {},
    approvals: Object.fromEntries(APPROVAL_KINDS.flatMap(kind => (POLICIES.has(approvals[kind] as ApprovalPolicy) ? [[kind, approvals[kind] as ApprovalPolicy]] : []))),
    ...typeof data.templates === 'string' && data.templates.trim() ? { templates: resolve(dir, data.templates.trim()) } : {},
    settings: Object.fromEntries(Object.entries(settings).map(([id, value]) => [id, isRecord(value) ? value : {}])),
    defaults: workspaceDefaults(data.defaults),
    needsMigration: data.documents !== undefined,
  }
}

export function isWorkspaceRoot(dir: string): boolean {
  if (!existsSync(join(dir, WORKSPACE_CONFIG))) return false
  try {
    return !readWorkspaceConfig(dir).singleDeck
  } catch {
    return true
  }
}

export interface DocumentEntry {
  dir: string
  entry: string
}

export interface FoundDocument extends DocumentSummary, DocumentEntry {
  /** The folder of the document it is under in the tree; absent at the top level. */
  parentDir?: string
}

const entryOf = (path: string): DocumentEntry => ({ dir: path.split('/').slice(0, -1).join('/'), entry: path })

/**
 * The documents on disk, without validating them: in a workspace every entry file found by the scan, in tree order
 * (depth first, siblings by rank); entries the tree leaves out (a second document with a taken ID) follow by path.
 */
export function listDocumentEntries(config: WorkspaceConfig): DocumentEntry[] {
  if (config.singleDeck) return [{ dir: '', entry: DOCUMENT_ENTRY }]
  const { documents, tree } = workspaceDocuments(config.root)
  const ordered = tree.order.map(node => node.path)
  const listed = new Set(ordered)
  return [...ordered, ...documents.map(document => document.path).filter(path => !listed.has(path))].map(entryOf)
}

/** The tree position of every listed document, by folder. */
export function documentPlaces(config: WorkspaceConfig): Map<string, { id: string, parent: string | null, depth: number, schemaVersion: unknown }> {
  if (config.singleDeck) return new Map()
  const { documents, tree } = workspaceDocuments(config.root)
  const versions = new Map(documents.map(document => [document.path, document.schemaVersion]))
  return new Map(tree.order.map(node => [entryOf(node.path).dir, { id: node.id, parent: node.parent, depth: node.depth, schemaVersion: versions.get(node.path) }]))
}

/** The metadata a document decides with (its language, plugins, renderers), inherited settings filled in. */
function effectiveMetadata(config: WorkspaceConfig, entry: string, parsed: unknown, scanned?: WorkspaceDocuments): Record<string, unknown> {
  if (!isRecord(parsed) || !isRecord(parsed.metadata)) return {}
  if (!isRecord(parsed.production) || !isRecord(parsed.placement)) return parsed.metadata
  return effectiveDocumentIn(config.root, join(config.root, entry), parsed as unknown as PresmiumDocument, scanned).metadata as unknown as Record<string, unknown>
}

/** What a summary needs of a document file (not its pages or blocks), kept until the file changes. */
const heads = new Map<string, { mtimeMs: number, size: number, value: unknown }>()
const headOf = (parsed: unknown) => isRecord(parsed) ? { id: parsed.id, schemaVersion: parsed.schemaVersion, placement: parsed.placement, metadata: parsed.metadata, production: parsed.production } : parsed
function documentHead(file: string): unknown {
  const stat = statSync(file)
  const known = heads.get(file)
  if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) return known.value
  const value = headOf(JSON.parse(readFileSync(file, 'utf8')))
  heads.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, value })
  return value
}

/** A document file another reader (the document index, reading asynchronously) has just parsed: listing it needs no second read. */
export function primeDocumentHead(file: string, mtimeMs: number, size: number, parsed: unknown): void {
  heads.set(file, { mtimeMs, size, value: headOf(parsed) })
}

/** `scanned`: the workspace scan the caller already has (listing every document must not scan once per document). */
export function readDocumentSummary(config: WorkspaceConfig, { dir, entry }: DocumentEntry, scanned?: WorkspaceDocuments): FoundDocument {
  let headmatter: Record<string, unknown> = {}
  try {
    headmatter = effectiveMetadata(config, entry, documentHead(join(config.root, entry)), scanned)
  } catch {
  }
  const tags = strings(headmatter.tags)
  return {
    dir,
    entry,
    title: typeof headmatter.title === 'string' && headmatter.title.trim() ? headmatter.title.trim() : dir || config.title,
    ...typeof headmatter.description === 'string' && headmatter.description.trim() ? { description: headmatter.description.trim() } : {},
    ...typeof headmatter.lang === 'string' && headmatter.lang.trim() ? { lang: headmatter.lang.trim() } : {},
    ...tags.length > 0 ? { tags } : {},
    ...isRecord(headmatter.renderers) && headmatter.renderers.slides !== undefined ? { slides: true } : {},
  }
}

const listed = new WeakMap<WorkspaceConfig, { generation: number, settings: unknown, documents: FoundDocument[] }>()

/**
 * The documents with their summaries, in tree order. Where the workspace service's index keeps the documents, the list
 * is reused until one of them changes; otherwise each document file is looked at (and read only when it changed).
 */
export function listDocuments(config: WorkspaceConfig): FoundDocument[] {
  const generation = config.singleDeck ? undefined : providedDocuments(config.root)?.generation
  const settings = workspaceSettings(config.root)
  const known = listed.get(config)
  if (generation !== undefined && known?.generation === generation && known.settings === settings) return known.documents.map(document => ({ ...document }))
  const documents = summarize(config)
  if (generation !== undefined) listed.set(config, { generation, settings, documents })
  return documents.map(document => ({ ...document }))
}

/** Each document's summary with the stamps of its file and its ancestors' files it was made from. */
const summaries = new WeakMap<WorkspaceConfig, { settings: unknown, entries: Map<string, { key: string, summary: FoundDocument }> }>()

function summarize(config: WorkspaceConfig): FoundDocument[] {
  const places = documentPlaces(config)
  const dirs = new Map([...places].map(([dir, place]) => [place.id, dir]))
  // With an index in this process, a summary is made again only when its file or an ancestor's file changed.
  const provided = config.singleDeck ? undefined : providedDocuments(config.root)
  const settings = workspaceSettings(config.root)
  const cache = summaries.get(config)
  const known = cache?.settings === settings ? cache.entries : new Map<string, { key: string, summary: FoundDocument }>()
  summaries.set(config, { settings, entries: known })
  const keyOf = (entry: DocumentEntry): string | undefined => {
    if (!provided) return undefined
    const stamps: string[] = [String(provided.stamps.get(entry.entry))]
    for (let at = places.get(entry.dir)?.parent ?? null, hops = 0; at !== null && hops < 64; hops++) {
      const dir = dirs.get(at)
      if (dir === undefined) break
      stamps.push(String(provided.stamps.get(dir ? `${dir}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY)))
      at = places.get(dir)?.parent ?? null
    }
    return stamps.join('|')
  }
  let scanned: WorkspaceDocuments | undefined
  return listDocumentEntries(config).map((entry) => {
    const key = keyOf(entry), cached = known.get(entry.entry)
    const found = key !== undefined && cached?.key === key ? cached.summary : readDocumentSummary(config, entry, scanned ??= config.singleDeck ? undefined : workspaceDocuments(config.root))
    if (key !== undefined) known.set(entry.entry, { key, summary: found })
    const parent = places.get(entry.dir)?.parent
    const parentDir = parent === null || parent === undefined ? undefined : dirs.get(parent)
    return parentDir === undefined ? found : { ...found, parentDir }
  })
}

export function documentSummaries(config: WorkspaceConfig): DocumentSummary[] {
  const places = documentPlaces(config)
  return listDocuments(config).map(({ entry: _entry, ...document }) => {
    const place = places.get(document.dir)
    return place ? { ...document, id: place.id, parent: place.parent, depth: place.depth } : document
  })
}

/** Whether a document may live in this folder: in a workspace any folder outside the skipped ones and translations. */
export function isDocumentDir(config: WorkspaceConfig, dir: string): boolean {
  if (config.singleDeck) return dir === ''
  const parts = dir.split('/')
  return dir !== '' && !parts.some(part => part === '' || part.startsWith('.') || SKIPPED.has(part)) && !parts.some((part, index) => part === 'locales' && index === parts.length - 2)
}

/** The document in `dir` with the settings it inherits from its ancestors and the workspace defaults; never saved. */
export function effectiveContent(config: WorkspaceConfig, dir: string, content: PresmiumDocument): EffectiveDocument {
  return effectiveDocumentIn(config.root, join(config.root, dir ? `${dir}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY), content)
}

/** What the document in `dir` inherits from its ancestors and the workspace defaults, without its own settings. */
export function inheritedContent(config: WorkspaceConfig, dir: string, content: PresmiumDocument): DocumentDefaults {
  return inheritedSettingsIn(config.root, join(config.root, dir ? `${dir}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY), content)
}

/** Which ancestor (or the workspace defaults, null) each setting the document in `dir` inherits comes from. */
export function inheritedOrigins(config: WorkspaceConfig, dir: string, content: PresmiumDocument): SettingOrigins {
  return settingOriginsIn(config.root, join(config.root, dir ? `${dir}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY), content)
}
