/**
 * Export (P-50): the slides `slidev export` captures. Each slide it exports
 * has at least one page, one per click step with clicks; how many steps a
 * slide shows in an export is Slidev's count (a component shows its static
 * fallback there, without its own steps), so a slide without any page is
 * what tells an export that captured the deck before the print page showed
 * every slide.
 */
import { parsePageFile } from './visual-diff.ts'

/** The slides of an export: 1 to `count` (the slides shown), those of `range` among them. */
export function exportedSlides(count: number, range?: ReadonlySet<number>): number[] {
  return Array.from({ length: count }, (_, i) => i + 1).filter(slide => !range || range.has(slide))
}

/** The slides of `slides` that have no image among `files` (`001.png`, `002-01.png`). */
export function missingSlides(files: readonly string[], slides: readonly number[]): number[] {
  const written = new Set(files.flatMap(file => parsePageFile(file)?.slide ?? []))
  return slides.filter(slide => !written.has(slide))
}
