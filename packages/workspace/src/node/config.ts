/**
 * The workspace (docs/ir.md section 10, docs/domain-model.md section 14): the
 * configuration `presmium.workspace.yaml` at its root, read once, and its
 * documents, found by the configuration's patterns (default `*\/lecture.md`)
 * and listed from their headmatter only.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DECK_ENTRY, readFrontmatter, WORKSPACE_CONFIG } from '@presmium/compiler'
import type { OperatorSettings } from '@presmium/compiler'
import { errorMessage, isRecord } from '@presmium/kernel'
import type { ApprovalKind } from '@presmium/kernel'
import type { ApprovalPolicy } from '@presmium/server'
import { parse as parseYaml } from 'yaml'
import type { WorkspaceDocument } from '../domain/api.ts'
import type { MembersConfig } from '../domain/members.ts'
import { matchesPattern, patternSegments } from '../domain/paths.ts'

/** The documents of a workspace without `documents` in its configuration. */
export const DEFAULT_DOCUMENTS = [`*/${DECK_ENTRY}`]

/** Directories never searched for documents. */
const SKIPPED = new Set(['node_modules', '.git', '.presmium', 'dist'])

const KINDS: ApprovalKind[] = ['operate', 'spend', 'write', 'agent']
const POLICIES = new Set<ApprovalPolicy>(['off', 'ask', 'allow'])

export interface WorkspaceConfig {
  /** The workspace root (absolute, real path). */
  root: string
  /** The site title: `title`, else the root directory's name. */
  title: string
  /** Patterns of the documents' entry files, in order. */
  documents: string[]
  /** The workspace root is the one document (no configuration of documents, a `lecture.md` at the root). */
  single: boolean
  /** `site`: the options of the site shell, and `home`. */
  site: Record<string, unknown>
  members: MembersConfig
  approvals: Partial<Record<ApprovalKind, ApprovalPolicy>>
  /** `templates`: the directory of the document templates (absolute); undefined for the templates installed with Presmium. */
  templates?: string
  settings: OperatorSettings
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map(v => v.trim()) : typeof value === 'string' && value.trim() ? [value.trim()] : []
}

/** Reads the workspace configuration of `root`; throws naming the file when it cannot be read. */
export function readWorkspace(root: string): WorkspaceConfig {
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
  const declared = strings(data.documents)
  const single = declared.length === 0 && existsSync(join(dir, DECK_ENTRY))
  const members = isRecord(data.members) ? data.members : {}
  const approvals = isRecord(data.approvals) ? data.approvals : {}
  const settings = isRecord(data.settings) ? data.settings : {}
  return {
    root: dir,
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : dir.split('/').at(-1) ?? 'Presmium',
    documents: single ? [DECK_ENTRY] : declared.length > 0 ? declared : DEFAULT_DOCUMENTS,
    single,
    site: isRecord(data.site) ? data.site : {},
    members: { owners: strings(members.owners), editors: strings(members.editors) },
    approvals: Object.fromEntries(KINDS.flatMap(kind => (POLICIES.has(approvals[kind] as ApprovalPolicy) ? [[kind, approvals[kind] as ApprovalPolicy]] : []))),
    ...typeof data.templates === 'string' && data.templates.trim() ? { templates: resolve(dir, data.templates.trim()) } : {},
    settings: Object.fromEntries(Object.entries(settings).map(([id, value]) => [id, isRecord(value) ? value : {}])),
  }
}

/** Whether `dir` is a workspace root that is not itself a deck: it has a configuration and no `lecture.md`, or declares its documents. */
export function isWorkspaceRoot(dir: string): boolean {
  if (!existsSync(join(dir, WORKSPACE_CONFIG))) return false
  try {
    return !readWorkspace(dir).single
  } catch {
    return true
  }
}

/** The entry files the patterns name, relative to the root, in pattern order, then by path. */
function entries(config: WorkspaceConfig): string[] {
  const found: string[] = []
  for (const pattern of config.documents) {
    const parts = patternSegments(pattern)
    const walk = (dir: string, rel: string, i: number): string[] => {
      const part = parts[i]!
      const last = i === parts.length - 1
      const names = typeof part === 'string'
        ? [part]
        : (() => {
            try {
              return readdirSync(dir).filter(name => !SKIPPED.has(name) && !name.startsWith('.') && part.test(name)).sort()
            } catch {
              return []
            }
          })()
      return names.flatMap((name) => {
        const path = join(dir, name)
        const next = rel ? `${rel}/${name}` : name
        if (last) return existsSync(path) && statSync(path).isFile() ? [next] : []
        return existsSync(path) && statSync(path).isDirectory() ? walk(path, next, i + 1) : []
      })
    }
    for (const entry of walk(config.root, '', 0)) if (!found.includes(entry)) found.push(entry)
  }
  return found
}

/** A document as found: its entry file too (relative to the workspace root). */
export interface FoundDocument extends WorkspaceDocument {
  entry: string
}

/** The document of an entry file (relative to the root): its directory, and its title, language and tags from its headmatter. */
function documentOf(config: WorkspaceConfig, entry: string): FoundDocument {
  const dir = entry.split('/').slice(0, -1).join('/')
  let headmatter: Record<string, unknown> = {}
  try {
    headmatter = readFrontmatter(readFileSync(join(config.root, entry), 'utf8'))
  } catch {
    // Listed by its directory.
  }
  const tags = strings(headmatter.tags)
  return {
    dir,
    entry,
    title: typeof headmatter.title === 'string' && headmatter.title.trim() ? headmatter.title.trim() : dir || config.title,
    ...typeof headmatter.lang === 'string' && headmatter.lang.trim() ? { lang: headmatter.lang.trim() } : {},
    ...tags.length > 0 ? { tags } : {},
  }
}

/** The documents of the workspace, read now (P-121). */
export function listDocuments(config: WorkspaceConfig): FoundDocument[] {
  return entries(config).map(entry => documentOf(config, entry))
}

/** Whether a document directory is one the configuration's patterns name (its entry file `lecture.md`). */
export function namedByPatterns(config: WorkspaceConfig, dir: string): boolean {
  return config.documents.some(pattern => matchesPattern(pattern, dir ? `${dir}/${DECK_ENTRY}` : DECK_ENTRY))
}
