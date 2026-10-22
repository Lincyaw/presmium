import { parsePageFile } from './visual-diff.ts'

export function exportedSlides(count: number, range?: ReadonlySet<number>): number[] {
  return Array.from({ length: count }, (_, i) => i + 1).filter(slide => !range || range.has(slide))
}

export function missingSlides(files: readonly string[], slides: readonly number[]): number[] {
  const written = new Set(files.flatMap(file => parsePageFile(file)?.slide ?? []))
  return slides.filter(slide => !written.has(slide))
}

export function parseRange(range: string | undefined): Set<number> | undefined {
  if (range === undefined) return undefined
  const slides = new Set<number>()
  for (const part of range.split(',').map(p => p.trim()).filter(Boolean)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part)
    if (!match) throw new Error(`invalid range "${range}"`)
    const from = Number(match[1])
    for (let n = from; n <= Number(match[2] ?? from); n++) slides.add(n)
  }
  return slides
}
