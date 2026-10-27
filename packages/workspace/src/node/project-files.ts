import { createHash } from 'node:crypto'
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs'
import { join, posix } from 'node:path'
import { DOCUMENT_ENTRY, parseAnchor, validateDocument } from '@lincyaw/kernel'
import type { ProjectOperation, TeachingDocument, DocumentFileChange } from '@lincyaw/kernel'
import { invalidDocumentDir, isWithin, movedUrl, rewriteLinks } from '../domain/paths.ts'
import { isDocumentDir, listDocuments, readWorkspaceConfig } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { RequestError } from './errors.ts'
import { DOCUMENT_OPERATION_MAX_BACKUP_BYTES, DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES, documentSourceEntries } from './writer.ts'
import { findTemplate, listTemplates, DEFAULT_TEMPLATE } from './templates.ts'

export const projectDigest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const entry = (dir: string) => dir ? `${dir}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY
const remote = /^(?:[a-z][a-z\d+.-]*:|\/|#|\?)/i
export function projectConfiguration(config: WorkspaceConfig): string {
  const file = join(config.root, 'presmium.workspace.yaml'), stat = lstatSync(file, { throwIfNoEntry: false })
  if (stat && (!stat.isFile() || stat.size > 1 << 20)) throw new RequestError(413, 'project-configuration-limit')
  const current = readWorkspaceConfig(config.root)
  if (JSON.stringify(current) !== JSON.stringify(config)) throw new RequestError(409, 'project-configuration-changed')
  return projectDigest(Buffer.concat([Buffer.from(JSON.stringify(config)), existsSync(file) ? readFileSync(file) : Buffer.alloc(0)]))
}

/** Bounded actual directory bytes plus every canonical reference and legacy relink input. No compilation. */
export function projectMaterial(config: WorkspaceConfig, operation: ProjectOperation, documentId?: string, result = false) {
  if (operation.dir !== '' && invalidDocumentDir(operation.dir)) throw new RequestError(400, 'project-directory-invalid')
  if ((operation.op === 'create' && invalidDocumentDir(operation.dir)) || ((operation.op === 'copy' || operation.op === 'rename') && invalidDocumentDir(operation.to))) throw new RequestError(400, 'project-directory-invalid')
  const hash = createHash('sha256'), seen = new Set<string>(), known = listDocuments(config)
  let files = 0, bytes = 0
  const add = (label: string, value: string | Uint8Array) => { hash.update(JSON.stringify([label, projectDigest(value)])) }
  const limit = () => { throw new RequestError(413, 'project-tree-limit', { maxEntries: DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES, maxBytes: DOCUMENT_OPERATION_MAX_BACKUP_BYTES }) }
  const walk = (path: string, label: string, documentRoot: string) => {
    if (seen.has(path)) return
    seen.add(path)
    const stat = lstatSync(path, { throwIfNoEntry: false })
    if (!stat) { add(label, 'absent'); return }
    if (++files > DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES || (bytes += stat.isDirectory() ? 0 : stat.size) > DOCUMENT_OPERATION_MAX_BACKUP_BYTES) limit()
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(path), resolved = posix.normalize(posix.join(posix.dirname(label), target))
      if (target.startsWith('/') || !isWithin(resolved, documentRoot)) throw new RequestError(409, 'project-external-link-unavailable', { path: label })
      add(label, 'link:' + target); return
    }
    add(label + ':mode', String(stat.mode & 0o777))
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) {
        if (name === '.git') throw new RequestError(409, 'project-nested-repository')
        walk(join(path, name), label ? `${label}/${name}` : name, documentRoot)
      }
    } else if (stat.isFile()) add(label, readFileSync(path))
    else throw new RequestError(409, 'project-file-kind-unavailable')
  }
  const safeParents = (dir: string) => {
    let path = config.root
    for (const part of dir.split('/').filter(Boolean)) {
      path = join(path, part)
      const stat = lstatSync(path, { throwIfNoEntry: false })
      if (!stat) break
      if (!stat.isDirectory()) throw new RequestError(409, 'project-directory-unavailable')
      if (existsSync(join(path, '.git'))) throw new RequestError(409, 'project-nested-repository')
    }
  }
  const dirs = operation.op === 'copy' || operation.op === 'rename' ? [operation.dir, operation.to] : [operation.dir]
  if (operation.op === 'retitle') walk(join(config.root, entry(operation.dir)), entry(operation.dir), operation.dir)
  else for (const dir of dirs) { safeParents(dir); walk(join(config.root, dir), dir, dir) }
  const canonical = new Map<string, TeachingDocument>()
  for (const doc of known) {
    safeParents(doc.dir)
    const path = join(config.root, doc.entry), stat = lstatSync(path)
    if (!stat.isFile() || stat.size > 2 << 20) throw new RequestError(413, 'project-document-limit', { document: doc.dir })
    if (++files > DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES || (bytes += stat.size) > DOCUMENT_OPERATION_MAX_BACKUP_BYTES) limit()
    const raw = readFileSync(path); add(doc.entry, raw)
    let parsed: unknown
    try { parsed = JSON.parse(raw.toString('utf8')) } catch { throw new RequestError(422, 'project-document-invalid', { document: doc.dir }) }
    const checked = validateDocument(parsed)
    if (!checked.document) throw new RequestError(422, 'project-document-invalid', { document: doc.dir })
    canonical.set(doc.dir, checked.document)
    if (operation.op === 'rename' || operation.op === 'delete') for (const item of documentSourceEntries(join(config.root, doc.dir), () => { if (++files > DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES) limit() })) {
      if (item.link !== undefined || !item.path.endsWith('.md')) continue
      const rel = doc.dir ? `${doc.dir}/${item.path}` : item.path, content = readFileSync(join(config.root, rel))
      if ((bytes += content.length) > DOCUMENT_OPERATION_MAX_BACKUP_BYTES || ++files > DOCUMENT_OPERATION_MAX_BACKUP_ENTRIES) limit()
      add(rel, content)
      if (!result && operation.op === 'delete' && !isWithin(rel, operation.dir) && rewriteLinks(content.toString('utf8'), rel, rel, operation.dir, '__removed__') !== content.toString('utf8')) throw new RequestError(409, 'project-referenced', { path: rel })
    }
  }
  let template: string | undefined
  if (operation.op === 'create') {
    const templates = listTemplates(config)
    template = operation.template ?? (templates.includes(DEFAULT_TEMPLATE) ? DEFAULT_TEMPLATE : templates[0])
    const source = template && findTemplate(config, template)
    if (!source) throw new RequestError(400, 'project-template-unavailable')
    walk(source, '@template', '@template')
    const stat = lstatSync(join(source, DOCUMENT_ENTRY), { throwIfNoEntry: false })
    if (!stat?.isFile() || stat.size > 2 << 20) throw new RequestError(422, 'project-template-invalid')
    const checked = validateDocument(JSON.parse(readFileSync(join(source, DOCUMENT_ENTRY), 'utf8')))
    if (!checked.document) throw new RequestError(422, 'project-template-invalid')
    canonical.set('@template', checked.document)
  }
  if (result) return { impactFiles: 0, impactBytes: 0, tree: hash.digest('hex'), files, bytes, changes: [] as DocumentFileChange[], template }
  if (operation.op !== 'create' && !canonical.has(operation.dir)) throw new RequestError(404, 'project-document-not-found')
  const target = operation.op === 'create' ? operation.dir : operation.op === 'copy' || operation.op === 'rename' ? operation.to : undefined
  if (target !== undefined) {
    if (invalidDocumentDir(target) || !isDocumentDir(config, target)) throw new RequestError(400, 'project-directory-invalid')
    if (existsSync(join(config.root, target))) throw new RequestError(409, 'project-target-exists')
    if (known.some(doc => doc.dir !== '' && (isWithin(target, doc.dir) || isWithin(doc.dir, target)))) throw new RequestError(409, 'project-nested-document')
  }
  const impactRoot = operation.op === 'create' ? findTemplate(config, template!)! : join(config.root, operation.dir)
  const impactEntries = operation.op === 'retitle' ? [{ path: DOCUMENT_ENTRY }] : operation.op === 'delete' || operation.op === 'rename'
    ? (() => { const entries: { path: string }[] = []; const collect = (dir: string, prefix: string) => { for (const name of readdirSync(dir)) { const path = prefix ? `${prefix}/${name}` : name, stat = lstatSync(join(impactRoot, path)); if (stat.isDirectory()) collect(join(impactRoot, path), path); else entries.push({ path }) } }; collect(impactRoot, ''); return entries })()
    : documentSourceEntries(impactRoot)
  const impactFiles = impactEntries.length, impactBytes = impactEntries.reduce((sum, item) => sum + lstatSync(join(impactRoot, item.path)).size, 0)
  const changes: DocumentFileChange[] = []
  const moving = operation.op === 'copy' || operation.op === 'rename', deleting = operation.op === 'delete'
  for (const [dir, document] of canonical) {
    const own = dir === operation.dir || dir === '@template', from = dir === '@template' ? '' : dir
    if (operation.op === 'copy' && !own || operation.op === 'create' && dir !== '@template' || operation.op === 'retitle' && !own || deleting && own) continue
    const to = own && moving ? operation.to : own && operation.op === 'create' ? operation.dir : from
    const was = entry(from), next = entry(to), before = JSON.stringify(document)
    const refused = (pointer: string) => { throw new RequestError(409, 'project-reference-unsupported', { document: dir, pointer }) }
    const url = (value: string, pointer: string): string => {
      if (remote.test(value)) return value
      let path: string
      try { path = decodeURI(value.split(/[?#]/)[0]!) } catch { return refused(pointer) }
      if (deleting && isWithin(posix.normalize(posix.join(from, path)), operation.dir)) throw new RequestError(409, 'project-referenced', { document: dir, pointer })
      return moving ? movedUrl(value, next, was, operation.dir, operation.to) ?? value : value
    }
    for (const [id, asset] of Object.entries(document.assets)) asset.location = url(asset.location, `/assets/${id}/location`)
    for (const [id, definition] of Object.entries(document.definitions)) if (definition.implementation.type === 'file') definition.implementation.path = url(definition.implementation.path, `/definitions/${id}/implementation/path`)
    const rich = (value: unknown, pointer: string) => {
      if (!value || typeof value !== 'object') return
      if (Array.isArray(value)) { value.forEach((node, index) => rich(node, `${pointer}/${index}`)); return }
      const node = value as Record<string, unknown>
      if (node.type === 'link' && typeof node.href === 'string') node.href = url(node.href, `${pointer}/href`)
      // Only the typed rich-text tree is traversed; plugin data and arbitrary strings are never rewritten.
      if (Array.isArray(node.children)) rich(node.children, pointer + '/children')
      if (Array.isArray(node.fallback)) rich(node.fallback, pointer + '/fallback')
    }
    for (const [id, block] of Object.entries(document.blocks)) {
      if (block.type === 'text') rich(block.content, `/blocks/${id}/content`)
      if (block.type === 'image') rich(block.caption, `/blocks/${id}/caption`)
      if (block.type === 'code') for (const origin of [block.origin, ...block.variants?.map(variant => variant.origin) ?? []]) {
        if (!origin || origin.repo) continue
        const parsed = parseAnchor(origin.anchor), at = parsed?.scheme === 'pattern' ? parsed.target.indexOf('#') : parsed?.target.lastIndexOf('#')
        if (!parsed || !['region', 'symbol', 'pattern'].includes(parsed.scheme) || at === undefined || at < 1) { if (own && moving) refused(`/blocks/${id}/origin`); continue }
        const path = parsed.target.slice(0, at)
        if (deleting && isWithin(path, operation.dir)) throw new RequestError(409, 'project-referenced', { document: dir, pointer: `/blocks/${id}/origin` })
        if (moving && isWithin(path, operation.dir) && origin.pin) {
          if (operation.op === 'rename') throw new RequestError(409, 'project-pinned-anchor-rename-unavailable', { document: dir, pointer: `/blocks/${id}/origin` })
          continue
        }
        if (moving && isWithin(path, operation.dir)) origin.anchor = `${parsed.scheme}:${operation.to}${path.slice(operation.dir.length)}${parsed.target.slice(at)}`
      }
    }
    for (const [threadId, thread] of Object.entries(document.comments ?? {})) for (const comment of thread.comments) rich(comment.content, `/comments/${threadId}/comments/${comment.id}/content`)
    if (document.metadata.translationOf) document.metadata.translationOf.entry = url(document.metadata.translationOf.entry, '/metadata/translationOf/entry')
    if (document.metadata.translations) for (const lang of Object.keys(document.metadata.translations)) document.metadata.translations[lang] = url(document.metadata.translations[lang]!, `/metadata/translations/${lang}`)
    if (own && (operation.op === 'create' || operation.op === 'copy')) { document.id = documentId!; if (operation.title) { document.metadata.title = operation.title; for (const section of Object.values(document.sections)) if (section.title === '{{title}}') section.title = operation.title } }
    if (own && operation.op === 'retitle') document.metadata.title = operation.title
    if (JSON.stringify(document) !== before || own && (operation.op === 'create' || operation.op === 'copy')) changes.push({ path: next, content: Buffer.from(JSON.stringify(document, null, 2) + '\n') })
  }
  if (operation.op === 'retitle' && changes.length === 0) throw new RequestError(409, 'project-no-change')
  if (changes.length > 16 || changes.reduce((size, change) => size + ('content' in change ? change.content.length : 0), 0) > 2 << 20) throw new RequestError(413, 'project-reference-limit', { maxFiles: 16, maxBytes: 2 << 20 })
  return { impactFiles, impactBytes, tree: hash.digest('hex'), files, bytes, changes, template }
}
