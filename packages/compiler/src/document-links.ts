import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DOCUMENT_ENTRY, validateDocument } from '@lincyaw/kernel'
import type { DocumentId, PresmiumDocument } from '@lincyaw/kernel'
import { effectiveDocumentIn, workspaceDocuments } from './document-tree.ts'

/** The workspace folder trashed documents wait in (`.trash/<id>/`). */
const TRASH_DIR = '.trash'

/** Another document as references and synced blocks need it: its file, folder and the document with inherited settings. */
export interface LinkedDocument {
  entry: string
  deckDir: string
  document: PresmiumDocument
  /** In the workspace's trash: synced blocks still show it, references treat it as gone. */
  trashed: boolean
}

/** Finds the workspace's documents by ID, for references and synced blocks. */
export interface DocumentLinks {
  resolve(id: DocumentId): LinkedDocument | undefined
}

interface Parsed { mtimeMs: number, size: number, document: PresmiumDocument | undefined }
const parsed = new Map<string, Parsed>()

function read(file: string): PresmiumDocument | undefined {
  let stat
  try { stat = statSync(file) } catch { return undefined }
  const known = parsed.get(file)
  if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) return known.document
  let document: PresmiumDocument | undefined
  try {
    const checked = validateDocument(JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')))
    document = checked.document && !checked.issues.some(issue => issue.severity === 'error') ? checked.document : undefined
  } catch { document = undefined }
  parsed.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, document })
  return document
}

/** The documents of the workspace at `root` by ID, from one scan; trashed documents are found in `.trash/<id>/`. */
export function workspaceLinks(root: string): DocumentLinks {
  const { tree } = workspaceDocuments(root)
  const found = new Map<DocumentId, LinkedDocument | undefined>()
  return {
    resolve(id) {
      if (found.has(id)) return found.get(id)
      const node = tree.byId.get(id)
      const trashed = node ? undefined : join(root, TRASH_DIR, id, DOCUMENT_ENTRY)
      const entry = node ? join(root, node.path) : trashed && existsSync(trashed) ? trashed : undefined
      const document = entry && read(entry)
      const linked = entry && document && document.id === id ? { entry, deckDir: dirname(entry), document: effectiveDocumentIn(root, entry, document), trashed: !node } : undefined
      found.set(id, linked)
      return linked
    },
  }
}
