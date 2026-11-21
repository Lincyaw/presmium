import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { effectiveDocumentIn, WORKSPACE_CONFIG, workspaceDefaults, workspaceDocuments } from '@lincyaw/compiler'
import type { OperatorSettings } from '@lincyaw/compiler'
import { APPROVAL_KINDS, DOCUMENT_ENTRY, errorMessage, isRecord } from '@lincyaw/kernel'
import type { ApprovalKind, DocumentDefaults, DocumentSummary, EffectiveDocument, PresmiumDocument } from '@lincyaw/kernel'
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

export interface FoundDocument extends DocumentSummary, DocumentEntry {}

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
function effectiveMetadata(config: WorkspaceConfig, entry: string, parsed: unknown): Record<string, unknown> {
  if (!isRecord(parsed) || !isRecord(parsed.metadata)) return {}
  if (!isRecord(parsed.production) || !isRecord(parsed.placement)) return parsed.metadata
  return effectiveDocumentIn(config.root, join(config.root, entry), parsed as unknown as PresmiumDocument).metadata as unknown as Record<string, unknown>
}

export function readDocumentSummary(config: WorkspaceConfig, { dir, entry }: DocumentEntry): FoundDocument {
  let headmatter: Record<string, unknown> = {}
  try {
    headmatter = effectiveMetadata(config, entry, JSON.parse(readFileSync(join(config.root, entry), 'utf8')))
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

export function listDocuments(config: WorkspaceConfig): FoundDocument[] {
  return listDocumentEntries(config).map(entry => readDocumentSummary(config, entry))
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
