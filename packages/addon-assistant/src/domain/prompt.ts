/**
 * What the assistant sends the agent (ACP `session/prompt`): how to read the
 * deck (the Presmium MCP tools), how to cite, the context of the request as
 * one JSON line (`presmium-context:`), and the request itself.
 */
import type { AgentContext, AgentTaskRequest } from '@presmium/kernel'

/** The marker of the context line. */
export const CONTEXT_MARKER = 'presmium-context:'

const LANGUAGES: Record<string, string> = { zh: 'Simplified Chinese (zh-CN)', en: 'English' }

/** The language to answer in: the deck's. */
function language(lang: string | undefined): string {
  const tag = lang?.trim() || 'zh-CN'
  return LANGUAGES[tag.toLowerCase().split('-')[0]!] ?? tag
}

const CITE = 'When your answer relies on a place in the document, link it as [its title](presmium://sections/<section id>), or [its title](presmium://sections/<section id>/steps/<step>) for one step, with the ids the tools give; the reader can follow these links.'

/** The context the page gave, without empty fields. */
function context(value: AgentContext): string {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined && v !== '')
  return `${CONTEXT_MARKER} ${JSON.stringify(Object.fromEntries(entries))}`
}

/** The prompt of a task, in the deck's language `lang`. */
export function promptText(request: AgentTaskRequest, lang?: string): string {
  const lines = request.kind === 'question'
    ? [
        'A reader asks a question about the course document (a Presmium deck) in your working directory.',
        'Read the document through the Presmium MCP tools (list_sections, get_section, get_step, search, get_code_ref, get_outputs, locate_source) and answer from it. Do not change any file and do not run anything.',
        CITE,
        `Answer in ${language(lang)}, briefly.`,
      ]
    : [
        `Change the course document (a Presmium deck) in your working directory as requested (a ${request.kind} task): edit its source files there only.`,
        'The Presmium MCP tools (list_sections, get_section, locate_source, get_diagnostics) show where each part of the document is in the source.',
        `Then say in ${language(lang)} what you changed.`,
      ]
  return [...lines, '', context(request.context), ...request.track ? [`track: ${request.track}`] : [], '', request.kind === 'question' ? 'Question:' : 'Request:', request.prompt].join('\n')
}
