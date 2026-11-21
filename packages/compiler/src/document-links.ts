import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { blockSubtree, DOCUMENT_ENTRY, validateDocument } from '@lincyaw/kernel'
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
  let scanned: ReturnType<typeof workspaceDocuments> | undefined
  const found = new Map<DocumentId, LinkedDocument | undefined>()
  return {
    resolve(id) {
      if (found.has(id)) return found.get(id)
      const node = (scanned ??= workspaceDocuments(root)).tree.byId.get(id)
      const trashed = node ? undefined : join(root, TRASH_DIR, id, DOCUMENT_ENTRY)
      const entry = node ? join(root, node.path) : trashed && existsSync(trashed) ? trashed : undefined
      const document = entry && read(entry)
      const linked = entry && document && document.id === id ? { entry, deckDir: dirname(entry), document: effectiveDocumentIn(root, entry, document, scanned), trashed: !node } : undefined
      found.set(id, linked)
      return linked
    },
  }
}

/** How far `embeddedPlugins` follows synced blocks inside synced blocks, as the lowering does. */
const EMBED_DEPTH = 4

/**
 * The plugins the document's synced blocks need beyond its own: for each embedded component that a plugin provides
 * (its definition's `data.plugin` or plugin implementation), the plugin's ID, and the source documents' plugins
 * (with their inherited settings) as the packages to look for it in. Synced blocks inside synced blocks count too.
 */
export function embeddedPlugins(document: PresmiumDocument, links: DocumentLinks): { packages: string[], ids: Set<string> } {
  const packages: string[] = [], ids = new Set<string>(), seen = new Set<string>()
  const visit = (blocks: PresmiumDocument['blocks'], depth: number) => {
    for (const block of Object.values(blocks)) {
      if (block.type !== 'embed' || depth >= EMBED_DEPTH || block.source.document === document.id) continue
      const key = `${block.source.document}#${block.source.block}`
      if (seen.has(key)) continue
      seen.add(key)
      const source = links.resolve(block.source.document)?.document
      const subtree = source && blockSubtree(source, block.source.block)
      if (!source || !subtree) continue
      let needed = false
      for (const item of Object.values(subtree)) {
        if (item.type !== 'component') continue
        const definition = source.definitions[item.definitionId]
        const data = definition?.data ?? {}
        const id = typeof data.plugin === 'string' ? data.plugin : definition?.implementation.type === 'plugin' ? definition.implementation.plugin : undefined
        if (id) { ids.add(id); needed = true }
      }
      if (needed) for (const name of source.metadata.plugins ?? []) if (!packages.includes(name)) packages.push(name)
      visit(subtree, depth + 1)
    }
  }
  visit(document.blocks, 0)
  return { packages, ids }
}
