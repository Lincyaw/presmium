import { readFileSync } from 'node:fs'
import type { SourcePos } from '@lincyaw/kernel'
import { withoutBom } from './frontmatter.ts'

export type LineFinder = (source: SourcePos, needles: string[]) => number

/** Finds the first line of a source span that contains one of the needles; reads each file once. */
export function lineFinder(): LineFinder {
  const files = new Map<string, string[]>()
  return (source, needles) => {
    let lines = files.get(source.file)
    if (!lines) {
      try {
        lines = readFileSync(source.file, 'utf8').split(/\r?\n/)
      } catch {
        lines = []
      }
      files.set(source.file, lines)
    }
    for (let line = source.line; line <= Math.min(source.endLine ?? source.line, lines.length); line++) {
      if (needles.some(needle => needle && lines[line - 1]!.includes(needle))) return line
    }
    return source.line
  }
}

/** The first line of the span that contains the text, or the span's first line. */
export function lineContaining(source: SourcePos, text: string): number {
  return lineFinder()(source, [text])
}

/** The 1-based line of the text that contains the needle, or 1. */
export function textLine(text: string, needle: string): number {
  return firstLineWith(text.split(/\r?\n/), needle)
}

/** The line of the headmatter that contains the needle, or 1. */
export function frontmatterLine(text: string, needle: string): number {
  const lines = withoutBom(text).split(/\r?\n/)
  const end = lines.indexOf('---', 1)
  return firstLineWith(lines.slice(0, end < 0 ? undefined : end), needle)
}

function firstLineWith(lines: string[], needle: string): number {
  const index = lines.findIndex(line => line.includes(needle))
  return index < 0 ? 1 : index + 1
}
