// `presmium migrate` and Studio's Upgrade: converts documents of schema version 1 to version 2 in place. Runtime code
// (the compiler, the viewer, the workspace's reads) never imports this module; only the command and the upgrade route do.
//
// Version 2 renames each `lecture.json` to `index.pmd` (translations too), gives every document a `placement` in the
// workspace tree (top level, ranked in the order the old `documents:` list of `presmium.workspace.yaml` gave, then by
// path), and removes `documents:` from that file. Settings stay explicit in each document: nothing is moved into
// inheritance. Paths that named `lecture.json` (translations, links, the workspace file) are rewritten.
import { existsSync, readdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { DOCUMENT_ENTRY, DOCUMENT_SCHEMA_VERSION, isRecord, ranksAfter, validateDocument } from '@lincyaw/kernel'
import type { PresmiumDocument, WorkspaceMigrationNeed } from '@lincyaw/kernel'
import { isMap, isScalar, isSeq, parseDocument, visit } from 'yaml'
import { workspaceDocuments } from './document-tree.ts'
import { documentDigest } from './translations.ts'
import { WORKSPACE_CONFIG } from './workspace-settings.ts'

/** The entry file of schema version 1. */
export const LEGACY_DOCUMENT_ENTRY = 'lecture.json'

const SKIPPED = new Set(['node_modules', '.git', '.presmium', 'dist', '.trash'])
const LEGACY_PATH = /(^|\/)lecture\.json(?=$|[#?])/
const legacyPath = (value: string) => value.replace(LEGACY_PATH, `$1${DOCUMENT_ENTRY}`)
const toPosix = (path: string) => path.split(sep).join('/')

export interface MigrationWrite { path: string, content: string }
export interface MigrationRename { from: string, to: string }

/** Everything one migration changes, relative to `root`; `problems` are documents it leaves alone and why. */
export interface MigrationPlan {
  root: string
  renames: MigrationRename[]
  writes: MigrationWrite[]
  /** The documents converted to version 2, by their new entry path. */
  documents: string[]
  workspaceFile: boolean
  problems: { path: string, message: string }[]
}

/** Every file named `name` under `root`, translations included, in path order. */
function findEntries(root: string, name: string): string[] {
  const found: string[] = []
  // A folder reached twice through symbolic links is migrated once, by the first path.
  const seen = new Set<string>()
  const walk = (dir: string, rel: string) => {
    let names: string[]
    try { const real = realpathSync(dir); if (seen.has(real)) return; seen.add(real); names = readdirSync(dir).sort() } catch { return }
    for (const entry of names) {
      if (SKIPPED.has(entry) || entry.startsWith('.')) continue
      const path = join(dir, entry), next = rel ? `${rel}/${entry}` : entry
      let stat
      try { stat = statSync(path) } catch { continue }
      if (stat.isDirectory()) walk(path, next)
      else if (entry === name && stat.isFile()) found.push(next)
    }
  }
  walk(root, '')
  return found
}

const isTranslation = (path: string) => /(^|\/)locales\/[^/]+\/[^/]+$/.test(path)
const dirOf = (path: string) => path.split('/').slice(0, -1).join('/')
const renamed = (path: string) => path.endsWith(LEGACY_DOCUMENT_ENTRY) ? `${path.slice(0, -LEGACY_DOCUMENT_ENTRY.length)}${DOCUMENT_ENTRY}` : path

/** `documents:` patterns of the old workspace file, matched against entry paths. */
function patternOrder(patterns: string[], paths: string[]): string[] {
  const ordered: string[] = []
  for (const pattern of patterns) {
    const want = pattern.replace(/^\.\//, '').split('/')
    const matcher = want.map(segment => new RegExp(`^${segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`))
    for (const path of paths) {
      const have = path.split('/')
      if (have.length === matcher.length && matcher.every((test, index) => test.test(have[index]!)) && !ordered.includes(path)) ordered.push(path)
    }
  }
  return ordered
}

/** Rewrites the strings of a document that name an entry file: translations, the original of a translation, links. */
function rewritePaths(document: Record<string, unknown>): void {
  const metadata = isRecord(document.metadata) ? document.metadata : undefined
  if (metadata && isRecord(metadata.translations)) for (const [lang, entry] of Object.entries(metadata.translations)) if (typeof entry === 'string') metadata.translations[lang] = legacyPath(entry)
  if (metadata && isRecord(metadata.translationOf) && typeof metadata.translationOf.entry === 'string') metadata.translationOf.entry = legacyPath(metadata.translationOf.entry)
  const links = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(links); return }
    if (!isRecord(value)) return
    if (value.type === 'link' && typeof value.href === 'string') value.href = legacyPath(value.href)
    for (const child of Object.values(value)) links(child)
  }
  links(document.blocks)
  links(document.comments)
}

/** The document as version 2: `placement` right after `id`, every other field as it was. */
function upgraded(value: Record<string, unknown>, rank: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, field] of Object.entries(value)) {
    result[key] = key === 'schemaVersion' ? DOCUMENT_SCHEMA_VERSION : field
    if (key === 'id') result.placement = { parent: null, rank }
  }
  if (!('placement' in result)) result.placement = { parent: null, rank }
  return result
}

/** The document in the formatting of the file it came from: its indentation, line endings and byte order mark. */
function serialize(value: unknown, text: string): string {
  const body = text.replace(/^﻿/, '')
  const indent = /^\{\r?\n([ \t]+)"/.exec(body)?.[1] ?? '  '
  const json = `${JSON.stringify(value, null, indent)}\n`
  return `${text.startsWith('﻿') ? '﻿' : ''}${body.includes('\r\n') ? json.replace(/\n/g, '\r\n') : json}`
}

/** What migrating the workspace or document folder `target` changes, without writing anything. */
export function planMigration(target: string): MigrationPlan {
  const root = resolve(target)
  const plan: MigrationPlan = { root, renames: [], writes: [], documents: [], workspaceFile: false, problems: [] }
  /** The content digest of each original before and after, by folder, to keep current translations current. */
  const digests = new Map<string, { before: string, after: string }>()
  const yamlFile = join(root, WORKSPACE_CONFIG)
  const yamlText = existsSync(yamlFile) ? readFileSync(yamlFile, 'utf8') : undefined
  const yaml = yamlText === undefined ? undefined : parseDocument(yamlText)
  const declared = yaml && isSeq(yaml.get('documents')) ? (yaml.get('documents') as { items: unknown[] }).items.flatMap(item => isScalar(item) && typeof item.value === 'string' ? [item.value] : []) : []

  const legacy = findEntries(root, LEGACY_DOCUMENT_ENTRY)
  const current = findEntries(root, DOCUMENT_ENTRY).filter((path) => {
    try { const value: unknown = JSON.parse(readFileSync(join(root, path), 'utf8').replace(/^﻿/, '')); return isRecord(value) && value.schemaVersion === 1 } catch { return false }
  })
  const reads = new Map<string, { text: string, value: Record<string, unknown> }>()
  for (const path of [...legacy, ...current]) {
    const text = readFileSync(join(root, path), 'utf8')
    let value: unknown
    try { value = JSON.parse(text.replace(/^﻿/, '')) } catch (error) { plan.problems.push({ path, message: error instanceof Error ? error.message : String(error) }); continue }
    if (!isRecord(value) || value.schemaVersion !== 1) { plan.problems.push({ path, message: `not a document of schema version 1` }); continue }
    if (path.endsWith(LEGACY_DOCUMENT_ENTRY) && existsSync(join(root, renamed(path)))) { plan.problems.push({ path, message: `${renamed(path)} exists already` }); continue }
    reads.set(path, { text, value })
  }

  const nodes = [...reads.keys()].filter(path => !isTranslation(path))
  const ordered = [...patternOrder(declared, nodes), ...nodes.filter(path => !patternOrder(declared, nodes).includes(path))]
  const placed = workspaceDocuments(root).tree
  const top = placed.children.get(null) ?? []
  const ranks = ranksAfter(top.length ? placed.byId.get(top.at(-1)!)!.placement.rank || null : null, ordered.length)
  const rankOf = new Map(ordered.map((path, index) => [path, ranks[index]!]))

  for (const [path, { text, value }] of reads) {
    const translation = isTranslation(path)
    // A translation is no tree node; it follows its original, whose rank it takes.
    const original = translation ? `${dirOf(dirOf(dirOf(path)))}${dirOf(dirOf(dirOf(path))) ? '/' : ''}${path.split('/').at(-1)}` : path
    const rank = rankOf.get(original) ?? rankOf.get(path) ?? ranksAfter(null, 1)[0]!
    const before = translation ? undefined : documentDigest(value as unknown as PresmiumDocument)
    const next = upgraded(value, rank)
    rewritePaths(next)
    const checked = validateDocument(next)
    if (!checked.document) { plan.problems.push({ path, message: checked.issues.slice(0, 3).map(issue => `${issue.path || '/'}: ${issue.message}`).join('; ') }); continue }
    reads.set(path, { text, value: next })
    if (before !== undefined) digests.set(dirOf(path), { before, after: documentDigest(next as unknown as PresmiumDocument) })
  }
  for (const [path, { value }] of reads) {
    if (value.schemaVersion !== DOCUMENT_SCHEMA_VERSION || !isTranslation(path)) continue
    const metadata = value.metadata as Record<string, unknown>
    const of = isRecord(metadata.translationOf) ? metadata.translationOf : undefined
    const original = of && typeof of.entry === 'string' ? toPosix(relative(root, resolve(root, dirOf(path), dirOf(of.entry) || '.'))) : undefined
    const digest = original === undefined ? undefined : digests.get(original)
    // A translation that was current for its original stays current; a stale one stays stale.
    if (of && digest && of.digest === digest.before) of.digest = digest.after
  }
  for (const [path, { text, value }] of reads) {
    if (value.schemaVersion !== DOCUMENT_SCHEMA_VERSION) continue
    const to = renamed(path)
    if (to !== path) plan.renames.push({ from: path, to })
    plan.writes.push({ path: to, content: serialize(value, text) })
    if (!isTranslation(path)) plan.documents.push(to)
    const freeze = join(root, dirOf(path), '.presmium', 'freeze')
    if (to !== path && existsSync(freeze)) for (const name of readdirSync(freeze).sort()) {
      if (!name.endsWith('.json')) continue
      const file = join(freeze, name), record: unknown = (() => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return undefined } })()
      if (isRecord(record) && typeof record.entry === 'string' && LEGACY_PATH.test(record.entry)) plan.writes.push({ path: toPosix(relative(root, file)), content: `${JSON.stringify({ ...record, entry: legacyPath(record.entry) })}` })
    }
  }

  if (yaml && yamlText !== undefined && isMap(yaml.contents)) {
    // Edit the text where the parsed file locates it, so that its formatting and comments stay as they are.
    const edits: { from: number, to: number, text: string }[] = []
    const documents = yaml.contents.items.find(pair => isScalar(pair.key) && pair.key.value === 'documents')
    if (documents && isScalar(documents.key) && documents.key.range) {
      const from = yamlText.lastIndexOf('\n', documents.key.range[0] - 1) + 1
      const valueEnd = (documents.value as { range?: [number, number, number] } | null)?.range?.[2] ?? documents.key.range[2]
      const lineEnd = yamlText.indexOf('\n', Math.max(valueEnd - 1, from))
      edits.push({ from, to: lineEnd < 0 ? yamlText.length : lineEnd + 1, text: '' })
    }
    visit(yaml, {
      Scalar(_key, node) {
        if (typeof node.value !== 'string' || !LEGACY_PATH.test(node.value) || !node.range) return
        const [from, to] = node.range
        if (edits.some(edit => from >= edit.from && to <= edit.to)) return
        edits.push({ from, to, text: yamlText.slice(from, to).replaceAll(LEGACY_DOCUMENT_ENTRY, DOCUMENT_ENTRY) })
      },
    })
    if (edits.length) {
      let text = yamlText
      for (const edit of edits.sort((x, y) => y.from - x.from)) text = `${text.slice(0, edit.from)}${edit.text}${text.slice(edit.to)}`
      plan.workspaceFile = true
      plan.writes.push({ path: WORKSPACE_CONFIG, content: text })
    }
  }
  return plan
}

/** Whether the workspace at `root` needs `presmium migrate`, cheaply enough to ask on every document listing. */
export function migrationNeed(root: string): WorkspaceMigrationNeed | undefined {
  const yamlFile = join(root, WORKSPACE_CONFIG)
  const yaml = existsSync(yamlFile) ? (() => { try { return parseDocument(readFileSync(yamlFile, 'utf8')) } catch { return undefined } })() : undefined
  const workspaceFile = Boolean(yaml?.has('documents'))
  const documents = [
    ...findEntries(root, LEGACY_DOCUMENT_ENTRY).filter(path => !isTranslation(path)),
    ...workspaceDocuments(root).documents.filter(document => document.schemaVersion !== DOCUMENT_SCHEMA_VERSION && document.problem === undefined).map(document => document.path),
  ]
  return workspaceFile || documents.length ? { documents, workspaceFile } : undefined
}

/** Carries out a plan: renames first (`rename` lets the caller keep history, as `git mv` does), then writes. */
export function applyMigration(plan: MigrationPlan, rename: (from: string, to: string) => void = (from, to) => renameSync(join(plan.root, from), join(plan.root, to))): void {
  for (const { from, to } of plan.renames) rename(from, to)
  for (const { path, content } of plan.writes) writeFileSync(join(plan.root, path), content)
}
