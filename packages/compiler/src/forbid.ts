import { irBlocks, isRecord, mdastText } from '@presmium/kernel'
import type { Finding, IRBlock, MdastNode, SourcePos } from '@presmium/kernel'
import { lineFinder } from './links.ts'
import type { PublishInput } from './links.ts'
import { viewFor } from './renderers.ts'

export function checkForbidden(input: PublishInput, headmatter: Record<string, unknown>): Finding[] {
  const given = isRecord(headmatter.checks) ? headmatter.checks.forbid : undefined
  if (given === undefined) return []
  const line = lineFinder()
  const at = (needle: string): SourcePos => ({ file: input.entry, line: line({ file: input.entry, line: 1, endLine: Number.MAX_SAFE_INTEGER }, [needle]) })
  if (!Array.isArray(given) || !given.every(item => typeof item === 'string')) {
    return [{ checkId: 'presmium.forbid', severity: 'error', message: 'checks.forbid must be a list of regular expressions', source: at('forbid') }]
  }
  const findings: Finding[] = []
  const patterns: { text: string, pattern: RegExp }[] = []
  for (const text of given) {
    try {
      patterns.push({ text, pattern: new RegExp(text, 'g') })
    } catch (error) {
      findings.push({ checkId: 'presmium.forbid', severity: 'error', message: `checks.forbid: ${(error as Error).message}`, source: at(text) })
    }
  }

  const hits = new Map<string, { source: SourcePos, match: string, pattern: string, renderers: string[] }>()
  for (const renderer of input.renderers) {
    const view = viewFor(input.doc, renderer)
    const texts = view.sections.flatMap(section => [
      { source: section.source, text: section.title },
      ...[...irBlocks(section.blocks)].map(block => ({ source: block.source, text: blockText(block) })),
    ])
    for (const { source, text } of texts) {
      for (const { text: name, pattern } of patterns) {
        for (const [match] of text.matchAll(pattern)) {
          if (!match) continue
          const key = `${source.file}\0${source.line}\0${name}\0${match}`
          const hit = hits.get(key)
          if (hit && !hit.renderers.includes(renderer)) hit.renderers.push(renderer)
          else if (!hit) hits.set(key, { source, match, pattern: name, renderers: [renderer] })
        }
      }
    }
  }
  for (const { source, match, pattern, renderers } of hits.values()) {
    findings.push({
      checkId: 'presmium.forbid',
      severity: 'error',
      message: `"${match}" matches ${pattern} of checks.forbid${renderers.length < input.renderers.length ? ` (in ${renderers.join(', ')})` : ''}`,
      source: { file: source.file, line: line(source, [match]) },
    })
  }
  return findings
}

function blockText(block: IRBlock): string {
  const { node } = block
  switch (node.type) {
    case 'markdown': return `${mdastText(node.mdast)}\n${targets(node.mdast).join('\n')}`
    case 'code': return [node.title ?? '', node.value, ...(node.variants ?? []).map(variant => variant.value), ...(node.outputs ?? []).flatMap(outputText)].join('\n')
    case 'component': return [...propText(node.props), ...node.fallback ? [mdastText(node.fallback)] : []].join('\n')
  }
}

function targets(node: MdastNode): string[] {
  const own = node.type === 'html' ? node.value : node.url
  return [...typeof own === 'string' ? [own] : [], ...(node.children ?? []).flatMap(targets)]
}

function outputText(run: NonNullable<Extract<IRBlock['node'], { type: 'code' }>['outputs']>[number]): string[] {
  return [run.stdout, run.stderr, ...(run.outputs ?? []).flatMap((output) => {
    if (output.output_type === 'stream') return [output.text]
    if (output.output_type === 'error') return [output.evalue, ...output.traceback]
    return Object.entries(output.data).flatMap(([type, value]) => (type.startsWith('text/') || type === 'application/json' ? propText(value) : []))
  })]
}

function propText(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(propText)
  if (value && typeof value === 'object') return Object.values(value).flatMap(propText)
  return []
}
