import { createTwoFilesPatch, FILE_HEADERS_ONLY } from 'diff'
import { toSnippet } from './regions.ts'

/**
 * Unified diff between the pinned code and the current code of one anchor
 * (P-14), on the displayed code: region markers and common indentation removed.
 */
export function driftDiff(file: string, pinned: { commit: string, text: string }, current: { label: string, text: string }): string {
  const before = `${toSnippet(pinned.text).code}\n`
  const after = `${toSnippet(current.text).code}\n`
  return createTwoFilesPatch(`${file}@${pinned.commit.slice(0, 7)}`, `${file}@${current.label}`, before, after, undefined, undefined, {
    context: 2,
    headerOptions: FILE_HEADERS_ONLY,
  }).trimEnd()
}
