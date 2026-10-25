import { blockText, irBlocks, stepKeys } from '@lincyaw/kernel'
import { applyRenderedEdit } from './text-edit.ts'
import type { IrAnswer, IRDocument, IRSection, SourceAnswer, SourcePos } from '@lincyaw/kernel'
import type { WorkspaceClient } from './workspace-client.ts'

export interface StepNarrationDraft {
  document: IRDocument
  section: string
  step: number
  source: SourceAnswer
  ranges: SourcePos[]
  label?: string
  text: string
  raw: string
  audience?: string[]
  mode: 'during' | 'after'
  template?: { before: string, after: string }
}

export function narrationBlocks(section: IRSection, step: number) {
  return [...irBlocks(section.blocks)].filter(b => b.role === 'narration' && b.at === step && (!b.only || b.only.includes('lecture')) && b.node.type === 'markdown')
}

export function animationDuration(section: IRSection, step: number): number {
  return Math.max(0, ...[...irBlocks(section.blocks)].map(b => b.node.type === 'component' ? b.node.durations?.[step - b.at] ?? 0 : 0))
}

export async function readStepNarration(client: WorkspaceClient, document: IRDocument, section: IRSection, step: number): Promise<StepNarrationDraft> {
  const blocks = narrationBlocks(section, step)
  const paths = new Set(blocks.map(b => b.source.file))
  if (paths.size > 1 || new Set(blocks.map(b => JSON.stringify([b.only, b.audience]))).size > 1) throw new Error('multiple-files')
  if (document.config.renderers.lecture?.script) throw new Error('script-file')
  const source = await client.readSource('', blocks[0]?.source.file ?? section.source.file)
  const lines = source.content.split('\n')
  let template: StepNarrationDraft['template']
  const raw = blocks.map(b => {
    const raw = lines.slice(b.source.line - 1, b.source.endLine ?? b.source.line).join('\n')
    if (b.node.type !== 'markdown' || !b.node.narration) return raw
    // Explicit narration has its own fence and options; leave the author's MyST and cues intact.
    const parts = /^(\s*(?:`{3,}|:{3,})\{narration\}[^\n]*\n(?:[ \t]*:[^:\n]+:[^\n]*\n)*[ \t]*\r?\n)([\s\S]*)(\r?\n[ \t]*(?:`{3,}|:{3,})[ \t]*\r?)$/.exec(raw)
    if (!parts) throw new Error('formatted-narration')
    if (blocks.length === 1) template = { before: parts[1]!, after: parts[3]! }
    return parts[2]!
  }).join('\n\n')
  const text = blocks.map(blockText).join('\n\n')
  return { document, section: section.id, step, source, ranges: blocks.map(b => b.source), label: blocks[0]?.id, audience: blocks[0]?.audience, text, raw, template, mode: blocks.some(b => b.node.type === 'markdown' && b.node.narration?.mode === 'after') ? 'after' : 'during' }
}

/** Step numbers are not identities: refuse to reuse a draft after its page's step structure changes. */
export function narrationTargetSignature(draft: StepNarrationDraft): string {
  const section = draft.document.sections.find(section => section.id === draft.section)
  return JSON.stringify([draft.source.path, section && stepKeys(section), draft.raw, draft.text, draft.mode])
}

/** Source writes and filesystem compilation finish independently. An acknowledgement needs the newer IR. */
export function narrationIrAfter(client: WorkspaceClient, document: string, revision: string): Promise<IrAnswer> {
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {}
    let finished = false
    const finish = (answer?: IrAnswer, error?: unknown) => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      unsubscribe()
      if (answer) resolve(answer)
      else reject(error)
    }
    const timeout = setTimeout(() => finish(undefined, new Error('narration-refresh')), 20_000)
    unsubscribe = client.subscribeIr(document, event => {
      if (event.revision === revision || finished) return
      void (async () => {
        let answer = await client.readIr(document)
        // An older in-flight HTTP request can resolve after the newer SSE event.
        if (answer.revision !== event.revision) answer = await client.readIr(document)
        if (answer.revision !== revision) finish(answer)
      })().catch(error => finish(undefined, error))
    })
  })
}

export function writeStepNarration(draft: StepNarrationDraft, text: string, mode: StepNarrationDraft['mode']): string {
  const lines = draft.source.content.split('\n')
  const edited = applyRenderedEdit(draft.raw, { line: 1, endLine: draft.raw.split('\n').length }, draft.text, text)
  if (!edited.ok) throw new Error('formatted-narration')
  const body = edited.content
  // A longer fence safely contains Markdown code fences or directive examples in the speech.
  const longest = Math.max(3, ...[...body.matchAll(/^(:{3,})/gm)].map(m => m[1]!.length + 1))
  const fence = ':'.repeat(longest)
  const header = draft.template?.before
  const block = header !== undefined
    ? `${/^\s*:mode:/m.test(header) ? header.replace(/^([ \t]*:mode:)[^\r\n]*/m, `$1 ${mode}`) : header.replace(/\r?\n[ \t]*\r?\n$/, `\n:mode: ${mode}\n\n`)}${body}${draft.template!.after}`
    : `${fence}{narration}\n${draft.label ? `:label: ${draft.label}\n` : ''}:at: ${draft.step}\n:mode: ${mode}${draft.audience ? `\n:audience: ${draft.audience.join(', ')}` : ''}\n\n${body.trim()}\n${fence}`
  const ranges = [...draft.ranges].sort((a, b) => b.line - a.line)
  if (ranges.length) {
    for (const range of ranges) lines.splice(range.line - 1, (range.endLine ?? range.line) - range.line + 1, range === ranges.at(-1) ? block : '')
  } else {
    const section = draft.document.sections.find(s => s.id === draft.section)!
    lines.splice(section.source.endLine ?? section.source.line, 0, '', block, '')
  }
  return lines.join('\n')
}
