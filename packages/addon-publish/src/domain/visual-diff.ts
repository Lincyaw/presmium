export interface PageRef {
  id: string
  slide: number
  step: number
}

export type PageStatus = 'same' | 'changed' | 'added' | 'removed'

export interface VisualDiff extends PageRef {
  status: PageStatus
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
  threshold: number
  pages: VisualDiff[]
  listed: VisualDiff[]
}

export function parsePageFile(name: string): PageRef | undefined {
  const match = /^(\d+)(?:-(\d+))?\.png$/.exec(name)
  if (!match) return undefined
  return { id: name.slice(0, -4), slide: Number(match[1]), step: match[2] === undefined ? 0 : Number(match[2]) - 1 }
}

export function parseWebFile(name: string, sections: ReadonlyMap<string, number>): PageRef | undefined {
  if (!name.endsWith('.png')) return undefined
  const stem = name.slice(0, -4)
  const present = /^present-(.+)$/.exec(stem)?.[1]
  return { id: `web/${stem}`, slide: present === undefined ? 0 : sections.get(present) ?? 0, step: 0 }
}

export function pairPages(a: string[], b: string[], parse: (name: string) => PageRef | undefined = parsePageFile): { page: PageRef, a?: string, b?: string }[] {
  const pages = new Map<string, { page: PageRef, a?: string, b?: string }>()
  for (const [side, files] of [['a', a], ['b', b]] as const) {
    for (const file of files) {
      const page = parse(file)
      if (page) pages.set(page.id, { page, ...pages.get(page.id), [side]: file })
    }
  }
  return [...pages.values()].sort((x, y) => x.page.slide - y.page.slide || x.page.step - y.page.step || x.page.id.localeCompare(y.page.id))
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
