import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { WORKSPACE_CONFIG } from '@lincyaw/compiler'
import type { OperatorSettings } from '@lincyaw/compiler'
import { APPROVAL_KINDS, DOCUMENT_ENTRY, errorMessage, isRecord } from '@lincyaw/kernel'
import type { ApprovalKind, DocumentSummary } from '@lincyaw/kernel'
import type { ApprovalPolicy } from '@lincyaw/server'
import { parse as parseYaml } from 'yaml'
import { matchesPattern, patternSegments } from '../domain/paths.ts'

export const DEFAULT_DOCUMENTS = [`*/${DOCUMENT_ENTRY}`]

const SKIPPED = new Set(['node_modules', '.git', '.presmium', 'dist'])

const POLICIES = new Set<ApprovalPolicy>(['off', 'ask', 'allow'])

export interface WorkspaceConfig {
  root: string
  title: string
  documents: string[]
  singleDeck: boolean
  site: Record<string, unknown>
  approvals: Partial<Record<ApprovalKind, ApprovalPolicy>>
  templates?: string
  settings: OperatorSettings
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
  const declared = strings(data.documents)
  const singleDeck = declared.length === 0 && existsSync(join(dir, DOCUMENT_ENTRY))
  const approvals = isRecord(data.approvals) ? data.approvals : {}
  const settings = isRecord(data.settings) ? data.settings : {}
  const renderers = isRecord(data.renderers) ? data.renderers : {}
  for (const [path, value] of [['renderers.lecture', renderers.lecture], ['settings.presmium.lecture', settings['presmium.lecture']]] as const) {
    if (isRecord(value) && Object.hasOwn(value, 'script')) throw new Error(`${file}: ${path}.script: External lecture scripts are not supported. Author narration in each document's lecture.json narrations.`)
  }
  return {
    root: dir,
    title: typeof data.title === 'string' && data.title.trim() ? data.title.trim() : dir.split('/').at(-1) ?? 'Presmium',
    documents: singleDeck ? [DOCUMENT_ENTRY] : declared.length > 0 ? declared : DEFAULT_DOCUMENTS,
    singleDeck,
    site: isRecord(data.site) ? data.site : {},
    approvals: Object.fromEntries(APPROVAL_KINDS.flatMap(kind => (POLICIES.has(approvals[kind] as ApprovalPolicy) ? [[kind, approvals[kind] as ApprovalPolicy]] : []))),
    ...typeof data.templates === 'string' && data.templates.trim() ? { templates: resolve(dir, data.templates.trim()) } : {},
    settings: Object.fromEntries(Object.entries(settings).map(([id, value]) => [id, isRecord(value) ? value : {}])),
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
        if (last) return name === DOCUMENT_ENTRY && existsSync(path) && statSync(path).isFile() ? [next] : []
        return existsSync(path) && statSync(path).isDirectory() ? walk(path, next, i + 1) : []
      })
    }
    for (const entry of walk(config.root, '', 0)) if (!found.includes(entry)) found.push(entry)
  }
  return found
}

export interface DocumentEntry {
  dir: string
  entry: string
}

export interface FoundDocument extends DocumentSummary, DocumentEntry {}

/** The configured documents that exist on disk, without reading their content. */
export function listDocumentEntries(config: WorkspaceConfig): DocumentEntry[] {
  return entries(config).map(entry => ({ dir: entry.split('/').slice(0, -1).join('/'), entry }))
}

export function readDocumentSummary(config: WorkspaceConfig, { dir, entry }: DocumentEntry): FoundDocument {
  let headmatter: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(config.root, entry), 'utf8'))
    headmatter = isRecord(parsed) && isRecord(parsed.metadata) ? parsed.metadata : {}
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
  return listDocuments(config).map(({ entry: _entry, ...document }) => document)
}

export function isDocumentDir(config: WorkspaceConfig, dir: string): boolean {
  return config.documents.some(pattern => matchesPattern(pattern, dir ? `${dir}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY))
}
