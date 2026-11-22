import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { DOCUMENT_ENTRY, DOCUMENT_MATERIALS_DIR, DOCUMENT_MATERIALS_MAX_BYTES, DOCUMENT_MATERIALS_MAX_FILES, hasRole, jsonResponse } from '@lincyaw/kernel'
import type { DocumentMaterialsAnswer, Route } from '@lincyaw/kernel'
import type { WorkspaceConfig } from './config.ts'
import { catchRequestErrors, RequestError } from './errors.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'
import type { DocumentWriter } from './writer.ts'

const NAME_MAX = 120
const bad = (status: number, code: string): never => { throw new RequestError(status, `document-materials-${code}`) }

/** A file name that stays one plain name in the materials folder: no folders, control characters or leading dots. */
function plainName(name: string): string {
  const base = (name.split(/[\\/]/).at(-1) ?? '').replace(/[\u0000-\u001f\u007f:*?"<>|]/g, '').replace(/^[.\s]+/, '').trim()
  if (!base) return 'material'
  if ([...base].length <= NAME_MAX) return base
  const dot = base.lastIndexOf('.'), extension = dot > 0 && base.length - dot <= 12 ? base.slice(dot) : ''
  return [...base.slice(0, base.length - extension.length)].slice(0, NAME_MAX - extension.length).join('') + extension
}

/** `name`, or `name (2)`, `name (3)`… before its extension, whichever is not taken yet. */
function freeName(name: string, taken: (name: string) => boolean): string {
  if (!taken(name)) return name
  const dot = name.lastIndexOf('.'), stem = dot > 0 ? name.slice(0, dot) : name, extension = dot > 0 ? name.slice(dot) : ''
  for (let n = 2; ; n++) {
    const next = `${stem} (${n})${extension}`
    if (!taken(next)) return next
  }
}

/**
 * Adds the author's source material (PDF, Word, slides, pictures, text…) to a document: the files are kept as they
 * are in the document's `materials/` folder, under its lock and recorded as one revision, for the AI to write the
 * document from. Nothing in the document refers to them.
 */
export function documentMaterialsRoute(options: { config: WorkspaceConfig, writer: DocumentWriter, locks: DocumentLocks, revisions?: Revisions }): Route {
  const { config, writer, locks, revisions } = options
  return {
    role: 'editor',
    maxBody: DOCUMENT_MATERIALS_MAX_BYTES + (1 << 20),
    handle: (request, ctx) => catchRequestErrors(async () => {
      if (request.method !== 'POST') return bad(405, 'method')
      if (!hasRole(ctx.member, 'editor')) return bad(403, 'forbidden')
      const dir = ctx.document
      if (!existsSync(join(config.root, dir, DOCUMENT_ENTRY))) return bad(404, 'document')
      const form = await request.formData().catch(() => bad(400, 'invalid'))
      const uploads = form.getAll('files')
      if (uploads.length === 0 || uploads.some(file => typeof file === 'string')) return bad(400, 'invalid')
      const files = uploads as File[]
      if (files.length > DOCUMENT_MATERIALS_MAX_FILES || files.reduce((sum, file) => sum + file.size, 0) > DOCUMENT_MATERIALS_MAX_BYTES) return bad(413, 'limit')
      const folder = dir ? `${dir}/${DOCUMENT_MATERIALS_DIR}` : DOCUMENT_MATERIALS_DIR
      const release = await locks.acquire(dir, 'document:materials')
      try {
        const write = async (): Promise<DocumentMaterialsAnswer> => {
          const names: string[] = []
          for (const file of files) names.push(freeName(plainName(file.name), name => names.includes(name) || existsSync(join(config.root, folder, name))))
          const paths = names.map(name => `${folder}/${name}`)
          if (revisions && await revisions.ignoresAny(paths)) return bad(403, 'forbidden')
          await revisions?.checkpoint(paths)
          const written: string[] = []
          try {
            for (const [index, file] of files.entries()) {
              request.signal.throwIfAborted()
              await writer.create(paths[index]!, new Uint8Array(await file.arrayBuffer()))
              written.push(paths[index]!)
            }
            const revision = revisions ? await revisions.commitWhileLocked({ paths, summary: `Add source material to ${dir || 'the document'}`, body: names.join('\n'), origin: { kind: 'editor', member: ctx.member } }) : undefined
            return { files: names.map(name => `${DOCUMENT_MATERIALS_DIR}/${name}`), ...revision ? { revision } : {} }
          } catch (error) {
            for (const path of written) rmSync(join(config.root, path), { force: true })
            throw error
          }
        }
        return jsonResponse(await (revisions ? revisions.transaction(write) : write()), 201)
      } finally { release() }
    }),
  }
}
