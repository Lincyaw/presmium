// Test-only node plugin. Self-contained (type imports only) so the fixture works from a temp copy.
import type { AnchorResolver, AnchorString, DeckSlide, Finding, PresmiumNodePlugin } from '@presmium/kernel'

// Anchor syntax of this fixture: a fenced block ```anchor holding `line:<file>#<text>`.
const BLOCK = /```anchor\n(\S[^\n]*)\n```/g

function usages(slides: DeckSlide[]): { anchor: AnchorString, slide: DeckSlide }[] {
  return slides.flatMap(slide => [...slide.content.matchAll(BLOCK)].map(m => ({ anchor: m[1] as AnchorString, slide })))
}

// `line:<file>#<text>` resolves to the first line of <file> containing <text>.
const line: AnchorResolver = {
  scheme: 'line',
  async resolve(anchor, src, recorded) {
    const [file = '', needle = ''] = anchor.slice('line:'.length).split('#')
    const lines = (await src.read(file))?.split('\n') ?? []
    const index = lines.findIndex(l => l.includes(needle))
    if (index < 0) return { status: 'lost', message: `"${needle}" not found in ${file}` }
    const text = lines[index]!
    const moved = recorded !== undefined && recorded.startLine !== index + 1
    return { status: moved ? 'moved' : 'exact', location: { file, startLine: index + 1, endLine: index + 1, text }, fingerprint: text.trim() }
  },
}

const plugin: PresmiumNodePlugin = {
  id: 'sample',
  resolvers: [line],
  anchors: ctx => usages(ctx.slides).map(u => u.anchor),
  checks: [
    {
      id: 'sample.todo',
      async run(ctx) {
        return ctx.slides
          .filter(slide => slide.content.includes('TODO'))
          .map(slide => ({ checkId: 'sample.todo', severity: 'error', message: `slide ${slide.index} is unfinished`, source: { file: slide.file, line: slide.line } }))
      },
    },
    {
      id: 'sample.anchors',
      async run(ctx) {
        const findings: Finding[] = []
        for (const { anchor, slide } of usages(ctx.slides)) {
          const source = { file: slide.file, line: slide.line }
          const resolution = await ctx.resolvers.resolve(anchor, ctx.src, ctx.lock.anchors[anchor])
          if (resolution.status === 'lost') findings.push({ checkId: 'sample.anchors', severity: 'error', message: `anchor ${anchor} is lost`, source })
          else if (!ctx.lock.anchors[anchor]) findings.push({ checkId: 'sample.anchors', severity: 'warning', message: `anchor ${anchor} is not locked`, source, hint: 'run presmium check --update-lock' })
        }
        return findings
      },
    },
    {
      id: 'sample.crash',
      async run(ctx) {
        const config = (ctx.headmatter.presmium as { sample?: { crash?: boolean } } | undefined)?.sample
        if (config?.crash) throw new Error('boom')
        return []
      },
    },
  ],
}

export default plugin
