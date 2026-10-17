/**
 * The locks of the documents (`DOCUMENT_LOCKS`, F-09, docs/architecture.md
 * 4.8): one writer of a document at a time. `presmium serve` provides them to
 * the documents' plugins; the document operations (`document:<op>`), the
 * history's undo (`revision:revert`) and the assistant's change tasks
 * (`agent:<task id>`, while they run and wait for their review) take them,
 * so a rename never commits an agent's files not yet reviewed, and an undo is
 * never rolled back by a review rejected after it.
 */
import type { DocumentLockService } from '@presmium/kernel'

export class DocumentLocks implements DocumentLockService {
  readonly #held = new Map<string, string>()

  claim(document: string, holder: string): (() => void) | undefined {
    if (this.#held.has(document)) return undefined
    this.#held.set(document, holder)
    let released = false
    return () => {
      if (released) return
      released = true
      this.#held.delete(document)
    }
  }

  holder(document: string): string | undefined {
    return this.#held.get(document)
  }

  /**
   * The locks of several documents for one holder, all or none: the function
   * that releases them, or the document another holds and who holds it.
   */
  claimAll(documents: string[], holder: string): { release(): void } | { document: string, holder: string } {
    const releases: (() => void)[] = []
    for (const document of new Set(documents)) {
      const release = this.claim(document, holder)
      if (release) {
        releases.push(release)
        continue
      }
      for (const taken of releases) taken()
      return { document, holder: this.holder(document)! }
    }
    return { release: () => releases.forEach(release => release()) }
  }
}

/** Why a document is not to be changed now, for a 409 (`holder` as `claimAll` names it). */
export function lockedMessage(document: string, holder: string): string {
  const what = holder.startsWith('agent:') ? 'an agent\'s change task runs or waits for its review' : holder.endsWith(':revert') ? 'a change is being undone' : 'a document operation is under way'
  return `${document || 'the document'} cannot change now: ${what} (${holder}); try again once it is done`
}
