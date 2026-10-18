import { diff3Merge } from 'node-diff3'

export interface Merged {
  text: string
  conflicts: number
}

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
