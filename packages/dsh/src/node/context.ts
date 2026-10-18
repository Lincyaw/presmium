/**
 * The `presmium-context` row (docs/design-dsh.md 6.4): a fixed guide in the
 * system message, and each session's document as runtime context, which
 * DeepSeek Harness writes into the session log with the user role (what the
 * model sees is recorded). The document is the session's own (its working
 * directory's), never this process's: the snapshot is registered in the
 * agent's scope when the agent is created, and refreshed before each step,
 * because the context provider is synchronous. It has the title, language,
 * entry file, sections, diagnostics, the position the windows report and the
 * focus the workbench reported (8.6), the latter as `get_focus` answers it.
 */
import type { DshAgent, DshContext } from './dsh.ts'
import type { PresmiumSession } from './service.ts'

export const name = 'presmium-context'
export const inject = ['presmium', 'systemPrompt']

/** The guide: what this workspace is, and how Presmium's tools, skills and review go with it. */
export const GUIDE = [
  'This is a Presmium workspace: lecture documents written in MyST Markdown, each in a directory of its own, which Presmium compiles to an intermediate representation and renders as a web page, slides and a notebook.',
  'Your working directory is one document\'s directory: edit its source with your file tools. The presmium__* tools read the compiled document (its sections, steps, code, outputs and diagnostics) and operate it (run a code block, build, move the presentation); they ask the author first where Presmium\'s approval policy says so.',
  'Load the presmium-author skill before you write MyST directives. The <presmium-document> context says where the document and the author are, and what the author points at (focus): start from there.',
  'Your changes are reviewed by the author before they are committed; do not commit them yourself.',
].join('\n')

/** The order of Presmium's guide and context among the prompt's parts: after the harness's own. */
const ORDER = 9000

/** A tool's JSON result; undefined when it failed. */
async function read(session: PresmiumSession, tool: string): Promise<any> {
  const result = await session.client.call(tool, {}).catch(() => undefined)
  if (!result || result.isError) return undefined
  try {
    return JSON.parse(result.text)
  } catch {
    return undefined
  }
}

/** The document's snapshot as the model reads it. */
export async function snapshot(session: PresmiumSession): Promise<string> {
  const [info, listed, position, focus] = await Promise.all(['deck_info', 'list_sections', 'get_position', 'get_focus'].map(tool => read(session, tool)))
  const where = session.document.dir || '.'
  const lines = [`Document ${JSON.stringify(where)} (relative to the workspace root; your working directory): "${info?.title ?? session.document.title}"${info?.lang ? `, language ${info.lang}` : ''}${info?.entry ? `, entry ${info.entry}` : ''}.`]
  if (info?.diagnostics) lines.push(`Diagnostics: ${info.diagnostics.errors} errors, ${info.diagnostics.warnings} warnings (presmium__get_diagnostics lists them).`)
  if (listed?.sections) lines.push('Sections (id: title):', ...(listed.sections as { id: string, title: string }[]).map(s => `- ${s.id}: ${s.title}`))
  const at = position?.position
  lines.push(at ? `Position: section ${at.section ?? '?'}, step ${at.step}${at.view ? `, ${at.view} view` : ''} (reported ${at.reported}).` : 'Position: no window shows the document.')
  lines.push(focus?.focus?.length ? `Focus, as presmium__get_focus answers: ${JSON.stringify(focus)}` : 'Focus: the author points at nothing; the position is where they are.')
  return `<presmium-document>\n${lines.join('\n')}\n</presmium-document>`
}

export function apply(ctx: DshContext): void {
  ctx.systemPrompt.section({ name: 'presmium:guide', order: ORDER, interpolate: false, text: GUIDE })
  /** The latest snapshot of each session. */
  const latest = new Map<string, string>()
  const refresh = async (agent: DshAgent) => {
    const session = ctx.presmium.session(agent)
    if (session) latest.set(session.id, await snapshot(session).catch(() => latest.get(session.id) ?? ''))
  }

  ctx.on('agent/created', async ({ agent }: { agent: DshAgent }) => {
    const session = await ctx.presmium.attach(agent)
    if (!session) return
    await refresh(agent)
    agent.ctx.systemPrompt.context({ name: 'presmium:document', order: ORDER, interpolate: false, text: () => latest.get(session.id) ?? '' })
  })
  // Before each step: the provider reads what this left (the author may have moved, or pointed at something, meanwhile).
  ctx.on('agent/pre-step', async (payload: { agent: DshAgent }, next: () => Promise<unknown>) => {
    await refresh(payload.agent)
    return next()
  })
  ctx.on('session/disposed', (session: { id: string }) => void latest.delete(session.id))
}
