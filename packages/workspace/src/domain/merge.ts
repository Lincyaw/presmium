/**
 * The merge the source editor offers when a file changed on disk since it
 * was opened (P-124): git's three-way merge by lines (diff3) of the editor's
 * text and the disk's, from the text both started from. Where both sides
 * only added lines at one place, both are kept (the disk's first); where
 * they changed the same lines, the conflict is marked as git marks it, so
 * neither side is lost and the author resolves it in the editor.
 */
import { diff3Merge } from 'node-diff3'

export interface Merged {
  text: string
  /** The places marked as conflicts. */
  conflicts: number
}

/** How the conflict markers name the two sides (the editor's, then the disk's). */
export interface MergeLabels {
  mine: string
  theirs: string
}

export function mergeTexts(mine: string, base: string, theirs: string, labels: MergeLabels): Merged {
  const lines: string[] = []
  let conflicts = 0
  for (const region of diff3Merge(mine.split('\n'), base.split('\n'), theirs.split('\n'), { excludeFalseConflicts: true })) {
    if (region.ok) {
      lines.push(...region.ok)
      continue
    }
    const { a, o, b } = region.conflict!
    if (o.length === 0) {
      lines.push(...b, ...a)
      continue
    }
    conflicts++
    lines.push(`<<<<<<< ${labels.mine}`, ...a, '=======', ...b, `>>>>>>> ${labels.theirs}`)
  }
  return { text: lines.join('\n'), conflicts }
}
