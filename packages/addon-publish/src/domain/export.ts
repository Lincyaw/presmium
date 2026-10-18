import { parsePageFile } from './visual-diff.ts'

export function exportedSlides(count: number, range?: ReadonlySet<number>): number[] {
  return Array.from({ length: count }, (_, i) => i + 1).filter(slide => !range || range.has(slide))
}

export function missingSlides(files: readonly string[], slides: readonly number[]): number[] {
  const written = new Set(files.flatMap(file => parsePageFile(file)?.slide ?? []))
  return slides.filter(slide => !written.has(slide))
}
