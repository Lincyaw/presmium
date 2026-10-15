/**
 * Visual diff (P-53): the share of differing pixels between two commits on the
 * same page, a page being one slide at one click step. Invariant: every page
 * whose difference exceeds the threshold is listed in the report.
 */

export interface PageRef {
  /** File stem of the exported image, e.g. `002-03`. */
  id: string
  /** 1-based slide number. */
  slide: number
  /** Click step, 0 before the first click. */
  step: number
}

export type PageStatus = 'same' | 'changed' | 'added' | 'removed'

/** The visual diff of one page. */
export interface VisualDiff extends PageRef {
  status: PageStatus
  /** Differing pixels over all pixels, 0 to 1; 1 when the page exists on one side only or changed size. */
  ratio: number
  diffPixels: number
}

export interface DiffSide {
  ref: string
  commit: string
}

export interface VisualDiffReport {
  a: DiffSide
  b: DiffSide
  /** Pages with a ratio above it are listed. */
  threshold: number
  pages: VisualDiff[]
  /** The pages that differ, in page order. */
  listed: VisualDiff[]
}

/** Reads a Slidev PNG export name: `002-03.png` is slide 2 after two clicks, `002.png` a slide without clicks. */
export function parsePageFile(name: string): PageRef | undefined {
  const match = /^(\d+)(?:-(\d+))?\.png$/.exec(name)
  if (!match) return undefined
  return { id: name.slice(0, -4), slide: Number(match[1]), step: match[2] === undefined ? 0 : Number(match[2]) - 1 }
}

/** Pairs the exported images of both sides by page, in page order. */
export function pairPages(a: string[], b: string[]): { page: PageRef, a?: string, b?: string }[] {
  const pages = new Map<string, { page: PageRef, a?: string, b?: string }>()
  for (const [side, files] of [['a', a], ['b', b]] as const) {
    for (const file of files) {
      const page = parsePageFile(file)
      if (page) pages.set(page.id, { page, ...pages.get(page.id), [side]: file })
    }
  }
  return [...pages.values()].sort((x, y) => x.page.slide - y.page.slide || x.page.step - y.page.step)
}

export function pageStatus(ratio: number, threshold: number, a: boolean, b: boolean): PageStatus {
  if (!a) return 'added'
  if (!b) return 'removed'
  return ratio > threshold ? 'changed' : 'same'
}

export function diffReport(a: DiffSide, b: DiffSide, threshold: number, pages: VisualDiff[]): VisualDiffReport {
  return { a, b, threshold, pages, listed: pages.filter(page => page.status !== 'same') }
}

const percent = (ratio: number) => `${(ratio * 100).toFixed(2)}%`

/** Human-readable report; image links are relative to the report directory. */
export function reportMarkdown(report: VisualDiffReport): string {
  const side = (s: DiffSide) => `\`${s.ref}\` (${s.commit.slice(0, 12)})`
  const lines = [
    `# Visual diff: ${side(report.a)} → ${side(report.b)}`,
    '',
    `${report.listed.length} of ${report.pages.length} pages differ (threshold ${percent(report.threshold)}).`,
  ]
  if (report.listed.length > 0) {
    lines.push('', '| Page | Slide | Step | Status | Differing pixels |', '|---|---|---|---|---|')
    for (const p of report.listed) lines.push(`| ${p.id} | ${p.slide} | ${p.step} | ${p.status} | ${percent(p.ratio)} |`)
    for (const p of report.listed) {
      lines.push('', `## ${p.id}`, '')
      const images = [p.status !== 'added' && `![a](a/${p.id}.png)`, p.status !== 'removed' && `![b](b/${p.id}.png)`, p.status === 'changed' && `![diff](diff/${p.id}.png)`]
      lines.push(images.filter(Boolean).join(' '))
    }
  }
  return `${lines.join('\n')}\n`
}
