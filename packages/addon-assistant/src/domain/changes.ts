/**
 * Change tasks (P-113 to P-115, P-121, P-136; docs/architecture.md 4.8):
 * what the agent reports on each annotation, and the message of the commit
 * an accepted task becomes (the annotations, the chat message or the
 * lecture track, and the agent's explanation; `REVISIONS` adds the trailers).
 */
import type { AgentTaskRequest, Locale } from '@presmium/kernel'

/** The workspace configuration at the workspace root: changing it needs an owner's `write` approval (10.4, section 11). */
export const WORKSPACE_CONFIG = 'presmium.workspace.yaml'

/** The line in which the agent reports on an annotation: `presmium-annotation <id>: <note>`, or `… <id> failed: <why>`. */
const NOTE = /^[ \t]*presmium-annotation[ \t]+([\w-]+)([ \t]+failed)?[ \t]*[:：][ \t]*(.*?)[ \t]*$/gm

export interface AnnotationNote {
  failed: boolean
  note?: string
}

/** The agent's reports on the annotations, by annotation id; the last report of an id counts. */
export function annotationNotes(text: string): Map<string, AnnotationNote> {
  const notes = new Map<string, AnnotationNote>()
  for (const [, id, failed, note] of text.matchAll(NOTE)) notes.set(id!, { failed: Boolean(failed), ...note ? { note } : {} })
  return notes
}

/** The agent's explanation without its report lines. */
export function explanationOf(text: string): string {
  return text.replace(NOTE, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** A `chat` whose context names only the document: drafting it (P-121), as the workspace's new-document form asks. */
export function isDraft(request: AgentTaskRequest): boolean {
  const { section, block, selection, step } = request.context
  return request.kind === 'chat' && !section && !block && !selection && step === undefined
}

const firstLine = (text: string, max = 60) => {
  const line = text.trim().split('\n')[0]!.trim()
  return line.length > max ? `${line.slice(0, max)}…` : line
}
const capped = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

const WORDS = {
  'zh-CN': {
    annotations: (n: number) => `批注修改：处理 ${n} 条批注`,
    chat: (prompt: string) => `对话修改：${firstLine(prompt)}`,
    draft: (prompt: string) => `起草：${firstLine(prompt)}`,
    transcript: (track: string) => `转写回写：讲授轨 ${track}`,
    annotationList: '批注：',
    note: '说明',
    failed: '未能处理',
    message: '对话：',
    track: (track: string) => `讲授轨：${track}（lectures/${track}/track.json）`,
    request: '要求：',
    explanation: 'agent 的说明：',
  },
  'en': {
    annotations: (n: number) => `Annotations: ${n} handled`,
    chat: (prompt: string) => `Chat: ${firstLine(prompt)}`,
    draft: (prompt: string) => `Draft: ${firstLine(prompt)}`,
    transcript: (track: string) => `Transcript: lecture track ${track}`,
    annotationList: 'Annotations:',
    note: 'Note',
    failed: 'not handled',
    message: 'Message:',
    track: (track: string) => `Lecture track: ${track} (lectures/${track}/track.json)`,
    request: 'Request:',
    explanation: 'The agent says:',
  },
}

/** The message of the commit of an accepted change task, in the deck's language; `REVISIONS` adds the trailers. */
export function commitMessage(request: AgentTaskRequest, notes: Map<string, AnnotationNote>, explanation: string, locale: Locale): string {
  const w = WORDS[locale]
  const body: string[] = []
  let summary: string
  if (request.kind === 'annotations') {
    const annotations = request.annotations ?? []
    summary = w.annotations(annotations.length)
    body.push(w.annotationList, ...annotations.flatMap((a) => {
      const reported = notes.get(a.id)
      const where = `${a.source.file}:${a.source.startLine}${a.source.endLine > a.source.startLine ? `-${a.source.endLine}` : ''}`
      return [
        `- ${where} (${a.section}/${a.block}): ${capped(a.request.replace(/\s+/g, ' ').trim(), 300)}`,
        ...reported?.note || reported?.failed ? [`  ${w.note}: ${reported.failed ? `${w.failed}: ` : ''}${capped(reported.note ?? '', 500)}`] : [],
      ]
    }))
  } else if (request.kind === 'transcript') {
    summary = w.transcript(request.track ?? '')
    body.push(w.track(request.track ?? ''), ...request.prompt.trim() ? [w.request, capped(request.prompt.trim(), 2000)] : [])
  } else {
    summary = isDraft(request) ? w.draft(request.prompt) : w.chat(request.prompt)
    body.push(w.message, capped(request.prompt.trim(), 2000))
  }
  if (explanation.trim()) body.push('', w.explanation, capped(explanation.trim(), 4000))
  return `${summary}\n${body.join('\n')}`
}
