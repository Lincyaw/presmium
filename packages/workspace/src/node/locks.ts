import type { DocumentLockService } from '@presmium/kernel'
import { lockKind } from '../domain/api.ts'

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

export function lockedMessage(document: string, holder: string): string {
  const kind = lockKind(holder)
  const what = kind === 'agent' ? 'an agent\'s change task runs or waits for its review' : kind === 'revert' ? 'a change is being undone' : 'a document operation is under way'
  return `${document || 'the document'} cannot change now: ${what} (${holder}); try again once it is done`
}
