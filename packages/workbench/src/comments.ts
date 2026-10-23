import type { PreviewAnchor } from '@lincyaw/kernel'

/** A comment the author left on a block or a passage of a document, kept in this browser. */
export interface DocumentComment {
  id: string
  section: string
  block?: string
  /** The passage the author selected, if any. */
  quote?: string
  text: string
  /** ISO time it was written. */
  at: string
  /** `sent`: handed to the AI; `resolved`: done with. */
  status: 'open' | 'sent' | 'resolved'
}

const PREFIX = 'presmium.comments.v1:'

/** The comments of each document, in the browser's storage under the workspace root and the document. */
export class CommentStore {
  #root = ''

  setRoot(root: string | undefined): void {
    this.#root = root ?? ''
  }

  read(document: string): DocumentComment[] {
    try {
      const raw = globalThis.localStorage?.getItem(this.#key(document))
      const parsed: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.filter(isComment) : []
    } catch {
      return []
    }
  }

  write(document: string, comments: readonly DocumentComment[]): void {
    try {
      if (comments.length === 0) globalThis.localStorage?.removeItem(this.#key(document))
      else globalThis.localStorage?.setItem(this.#key(document), JSON.stringify(comments))
    } catch {
    }
  }

  #key(document: string): string {
    return `${PREFIX}${this.#root}|${document}`
  }
}

export function newComment(target: PreviewAnchor, text: string, quote?: string): DocumentComment {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return { id, section: target.section, ...target.block ? { block: target.block } : {}, ...quote ? { quote } : {}, text, at: new Date().toISOString(), status: 'open' }
}

function isComment(value: unknown): value is DocumentComment {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return typeof c.id === 'string' && typeof c.section === 'string' && typeof c.text === 'string' && typeof c.at === 'string'
    && (c.status === 'open' || c.status === 'sent' || c.status === 'resolved')
}
