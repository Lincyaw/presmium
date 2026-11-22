import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { importDocuments } from '@lincyaw/compiler'
import { DOCUMENT_ENTRY, DOCUMENT_IMPORT_MAX_BYTES, DOCUMENT_IMPORT_MAX_FILES, hasRole, jsonResponse, validateDocument } from '@lincyaw/kernel'
import type { DocumentImportAnswer, Route } from '@lincyaw/kernel'
import { readWorkspaceConfig } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'
import type { DocumentWriter } from './writer.ts'
import type { DocumentsChange } from './document-operations.ts'

const bad = (status: number, code: string): never => { throw new RequestError(status, `document-import-${code}`) }
/** Word and PowerPoint files from before 2007, which the converter cannot read. */
const LEGACY = /\.(?:doc|ppt|pps)$/i
const plainPath = (path: unknown): path is string => typeof path === 'string' && path.length > 0 && path.length <= 500
  && !path.startsWith('/') && !/[\\\0:]/.test(path) && !path.split('/').some(part => !part || part === '.' || part === '..' || ['.git', '.presmium', 'node_modules', 'dist'].includes(part))

/**
 * Where a batch goes in the workspace: its folders at the top level under their own names when none is taken (one
 * file imports as `<name>/`); a single folder whose name is taken gets the first free `<name>-<n>`; several folders, any
 * of them taken, go together into the first free `imported`, `imported-<n>` (links between them stay relative).
 */
function placement(root: string, tops: string[]): { directory: string, place(path: string): string } {
  const free = (name: string) => { let candidate = name; for (let n = 2; existsSync(join(root, candidate)); n++) candidate = `${name}-${n}`; return candidate }
  if (!tops.some(top => existsSync(join(root, top)))) return { directory: tops.length === 1 ? tops[0]! : '', place: path => path }
  if (tops.length === 1) {
    const directory = free(tops[0]!)
    return { directory, place: path => `${directory}${path.slice(tops[0]!.length)}` }
  }
  const directory = free('imported')
  return { directory, place: path => `${directory}/${path}` }
}

/** Uploaded sources are converted before a single locked, rollback-capable workspace publication. */
export function documentImportRoute(options: { config: WorkspaceConfig, writer: DocumentWriter, locks: DocumentLocks, revisions?: Revisions, changed(change: DocumentsChange): Promise<void> }): Route {
  const { config, writer, locks, revisions } = options
  return {
    role: 'owner', maxBody: DOCUMENT_IMPORT_MAX_BYTES + (1 << 20),
    handle: (request, ctx) => catchRequestErrors(async () => {
      if (request.method !== 'POST') return bad(405, 'method')
      if (!hasRole(ctx.member, 'owner') || ctx.document !== '') return bad(403, 'forbidden')
      if (config.singleDeck || !revisions) return bad(409, 'unavailable')
      const form = await request.formData().catch(() => bad(400, 'invalid'))
      const raw = form.get('paths')
      if (typeof raw !== 'string' || raw.length > 512_000) return bad(400, 'invalid')
      let paths: unknown
      try { paths = JSON.parse(raw) } catch { return bad(400, 'invalid') }
      const uploads = form.getAll('files')
      if (!Array.isArray(paths) || paths.length === 0 || paths.length > DOCUMENT_IMPORT_MAX_FILES || paths.length !== uploads.length || !paths.every(plainPath)) return bad(400, 'invalid')
      if (new Set(paths.map(path => path.toLowerCase())).size !== paths.length) return bad(400, 'invalid')
      if (uploads.some(file => typeof file === 'string') || uploads.reduce((sum, file) => sum + (typeof file === 'string' ? 0 : file.size), 0) > DOCUMENT_IMPORT_MAX_BYTES) return bad(413, 'limit')
      const temporary = mkdtempSync(join(tmpdir(), 'presmium-import-'))
      try {
        const source = join(temporary, 'source'), output = join(temporary, 'output')
        mkdirSync(source)
        for (const [index, path] of paths.entries()) {
          const file = uploads[index] as File
          request.signal.throwIfAborted()
          mkdirSync(dirname(join(source, path)), { recursive: true })
          writeFileSync(join(source, path), Buffer.from(await file.arrayBuffer()), { flag: 'wx' })
        }
        const report = await importDocuments(source, { out: output, preserveOriginal: true, workspaceRoot: config.root }).catch(() => bad(422, 'conversion'))
        if (report.documents.length === 0) return bad(422, paths.some(path => LEGACY.test(path)) ? 'legacy' : 'empty')
        const files: { path: string, content: Buffer }[] = []
        let bytes = 0
        const walk = (dir: string, path = '') => {
          for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const rel = path ? `${path}/${entry.name}` : entry.name
            if (entry.isDirectory()) walk(join(dir, entry.name), rel)
            else {
              const content = readFileSync(join(dir, entry.name))
              if (files.length >= DOCUMENT_IMPORT_MAX_FILES || (bytes += content.byteLength) > DOCUMENT_IMPORT_MAX_BYTES) bad(413, 'limit')
              files.push({ path: rel, content })
            }
          }
        }
        walk(output)
        const documents = report.documents.map(dir => {
          const checked = validateDocument(JSON.parse(readFileSync(join(output, dir, DOCUMENT_ENTRY), 'utf8')))
          if (!checked.document || checked.issues.some(issue => issue.severity === 'error')) return bad(422, 'conversion')
          checked.document.id = randomUUID()
          files.find(file => file.path === `${dir}/${DOCUMENT_ENTRY}`)!.content = Buffer.from(`${JSON.stringify(checked.document, null, 2)}\n`)
          return { dir, title: checked.document.metadata.title }
        })
        const release = await locks.acquire('', 'document:import')
        try {
          const answer = await revisions.transaction(async (): Promise<DocumentImportAnswer> => {
            request.signal.throwIfAborted()
            const { directory, place } = placement(config.root, [...new Set(files.map(item => item.path.split('/')[0]!))])
            const placed = files.map(item => ({ ...item, path: place(item.path) }))
            const tops = [...new Set(placed.map(item => item.path.split('/')[0]!))]
            if (tops.some(top => existsSync(join(config.root, top)))) return bad(409, 'changed')
            if (readWorkspaceConfig(config.root).singleDeck) return bad(409, 'unavailable')
            if (await revisions.ignoresAny(placed.map(item => item.path))) return bad(403, 'forbidden')
            await revisions.checkpoint(tops)
            const checkpoint = await writer.checkpoint(tops)
            const before = await revisions.head()
            let committed = false
            try {
              for (const item of placed) { request.signal.throwIfAborted(); await writer.create(item.path, item.content, true) }
              request.signal.throwIfAborted()
              const revision = await revisions.commitWhileLocked({ paths: tops, summary: `Import ${documents.length} documents`, body: '', origin: { kind: 'document', member: ctx.member, operation: { op: 'create', dir: directory || tops[0]! } } })
              if (!revision) return bad(409, 'changed')
              committed = true
              return { directory, documents: documents.map(doc => ({ ...doc, dir: place(doc.dir) })), files: files.length, unresolved: report.unresolved.length, warnings: report.warnings ?? 0, ...revision ? { revision } : {} }
            } catch (error) {
              if (await revisions.head() !== before) { committed = true; throw new RequestError(409, 'document-import-changed', { committed: true }) }
              await checkpoint.restore()
              throw error
            } finally { if (committed || await revisions.head() === before) checkpoint.dispose() }
          })
          try { await options.changed({ removed: [], added: answer.documents.map(doc => doc.dir) }) }
          catch { throw new RequestError(409, 'document-import-changed', { committed: true }) }
          return jsonResponse(answer, 201)
        } finally { release() }
      } finally { rmSync(temporary, { recursive: true, force: true }) }
    }),
  }
}
