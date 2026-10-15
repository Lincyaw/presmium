// Test-only plugin. Self-contained (type imports only) so the fixture works from a temp copy.
import type { AnchorResolver, AnchorString, ComponentNode, Finding, IRBlock, IRDocument, PresmiumNodePlugin } from '@presmium/kernel'

// Anchor syntax of this fixture: the directive ```{anchor} line:<file>#<text>```.
function usages(doc: IRDocument): { anchor: AnchorString, block: IRBlock }[] {
  return doc.sections.flatMap(section => section.blocks.flatMap(block =>
    block.node.type === 'component' && block.node.name === 'SampleAnchor' ? [{ anchor: block.node.props.anchor as AnchorString, block }] : []))
}

// `line:<file>#<text>` resolves to the first line of <file> containing <text>, in the working tree or at a revision.
const line: AnchorResolver = {
  scheme: 'line',
  async resolve(anchor, src, recorded, ref) {
    const [file = '', needle = ''] = anchor.slice('line:'.length).split('#')
    const lines = (await src.read(file, ref))?.split('\n') ?? []
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
  directives: [{
    name: 'anchor',
    arg: true,
    toIR: input => ({ node: { type: 'component', plugin: 'sample', name: 'SampleAnchor', props: { anchor: input.arg } } }),
  }],
  // Quotes each anchored line as it is in the working tree and as it was committed.
  passes: [{
    name: 'sample.quote',
    async run(doc, ctx) {
      for (const { anchor, block } of usages(doc)) {
        const { props } = block.node as ComponentNode
        props.text = (await ctx.resolvers.resolve(anchor, ctx.src)).location?.text
        props.committed = (await ctx.resolvers.resolve(anchor, ctx.src, undefined, 'HEAD')).location?.text
      }
    },
  }],
  anchors: ctx => usages(ctx.ir).map(u => u.anchor),
  checks: [
    {
      id: 'sample.todo',
      async run(ctx) {
        return ctx.ir.sections.flatMap(section => section.blocks
          .filter(block => JSON.stringify(block.node).includes('TODO'))
          .map((block): Finding => ({ checkId: 'sample.todo', severity: 'error', message: `section ${section.index} is unfinished`, source: block.source })))
      },
    },
    {
      id: 'sample.anchors',
      async run(ctx) {
        const findings: Finding[] = []
        for (const { anchor, block } of usages(ctx.ir)) {
          const source = block.source
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
