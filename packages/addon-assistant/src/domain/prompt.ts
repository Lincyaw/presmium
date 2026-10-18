import type { AgentContext, AgentTaskRequest } from '@presmium/kernel'
import { isDraft } from './changes.ts'

export const CONTEXT_MARKER = 'presmium-context:'
export const ANNOTATIONS_MARKER = 'presmium-annotations:'

const LANGUAGES: Record<string, string> = { zh: 'Simplified Chinese (zh-CN)', en: 'English' }

export function language(lang: string | undefined): string {
  const tag = lang?.trim() || 'zh-CN'
  return LANGUAGES[tag.toLowerCase().split('-')[0]!] ?? tag
}

function context(value: AgentContext): string {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== '')
  return `${CONTEXT_MARKER} ${JSON.stringify(Object.fromEntries(entries))}`
}

function changeLines(request: AgentTaskRequest, lang: string | undefined): string[] {
  const common = [
    'You change a course document (a Presmium deck: MyST Markdown, its entry lecture.md) in your working directory: edit its source files there only, and keep its headmatter.',
    'The Presmium MCP tools (list_sections, get_section, locate_source, get_diagnostics) show where each part of the document is in the source; the author reviews your changes file by file before they are committed.',
  ]
  if (request.kind === 'annotations') {
    const annotations = (request.annotations ?? []).map(({ id, section, block, source, excerpt, request: asked }) => ({ id, section, block, file: source.file, startLine: source.startLine, endLine: source.endLine, excerpt, request: asked }))
    return [
      ...common,
      'The author annotated blocks of the page: each annotation names the block\'s source (file, relative to your working directory, and lines), an excerpt of it and a request. Apply each request to its block.',
      `${ANNOTATIONS_MARKER} ${JSON.stringify(annotations)}`,
      `Then say in ${language(lang)} what you changed, and end with one line for each annotation: \`presmium-annotation <id>: <what you did>\`, or \`presmium-annotation <id> failed: <why>\`.`,
    ]
  }
  if (request.kind === 'transcript') {
    return [
      ...common,
      `The lecture track ${request.track} (its file: lectures/${request.track}/track.json, relative to your working directory) holds the transcript of a recorded lecture: speech segments with their text and times, and the sections and steps the speaker was at. Write it back into the narration as the request says.`,
      `Then say in ${language(lang)} what you changed.`,
    ]
  }
  return [
    ...common,
    isDraft(request)
      ? 'The author asks for a draft of this document, which may be new: write it in full in lecture.md as the request says (chapters with level-1 headings, sections with level-2 headings).'
      : 'The request is the author\'s message in the page; the context says where they are in the document (section, step, block, selected text, and the section\'s source lines).',
    `Then say in ${language(lang)} what you changed.`,
  ]
}

export function promptText(request: AgentTaskRequest, lang?: string): string {
  const track = request.kind === 'transcript' && request.track ? [`track: ${request.track} (lectures/${request.track}/track.json)`] : []
  return [...changeLines(request, lang), '', context(request.context), ...track, '', 'Request:', request.prompt].join('\n')
}
