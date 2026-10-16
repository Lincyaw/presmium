/**
 * A change task (`annotations`, `chat` with drafting, `transcript`; D12,
 * docs/architecture.md 4.8 and 10.7), the same rule for every kind:
 *
 * 1. Its review opens first: `CHANGE_REVIEW` where one is registered
 *    (deltabox; in SHARED serve agent-host's), else the assistant's git
 *    review (./git-review.ts). The agent's working directory is its `root`.
 * 2. Each tool call the agent completes is a checkpoint (`step` event).
 * 3. Once the agent ended, its reports on the annotations become their
 *    `annotation` events; then, by `settings.presmium.assistant.review`, the
 *    sender reviews the changes (`review` event, `required`, the default)
 *    or they are accepted at once (`auto`).
 * 4. Accepting restores the rejected files from the snapshot and commits the
 *    rest through `REVISIONS` as one commit (with the writes outside the
 *    directory an owner allowed); a change of the workspace configuration
 *    (a single-deck repository's document directory holds it) needs an
 *    owner's `write` approval first, else it is rejected too. Rejecting all
 *    restores the directory as the task found it, without a commit.
 *
 * A task that fails or is cancelled, or is left waiting when the server
 * closes, is rolled back.
 */
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { CHANGE_REVIEW, deckLocale, errorMessage, REVISIONS } from '@presmium/kernel'
import type { AgentEvent, AgentTaskRequest, ApprovalRequest, ChangeReview, ReviewChange, ReviewDecision, ServerContext } from '@presmium/kernel'
import { annotationNotes, ASSISTANT_MESSAGES, commitMessage, explanationOf, reviewMode, WORKSPACE_CONFIG } from '../domain/index.ts'
import { GIT_ENGINE, openGitReview } from './git-review.ts'
import type { Task, Tasks } from './tasks.ts'

export interface ChangeRun {
  ctx: ServerContext
  tasks: Tasks
  /** Runs the task's agent session in `cwd` (events through `onEvent`); resolves with its messages, throws its failure. */
  agent(task: Task, cwd: string, request: AgentTaskRequest, onEvent: (event: AgentEvent) => Promise<void>): Promise<string[]>
  /** Asks an approval for the task (announced to its page). */
  ask(task: Task, request: ApprovalRequest): Promise<boolean>
}

/** Whether `path` is `dir` or below it. */
function within(path: string, dir: string): boolean {
  const rel = relative(dir, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** Waits for the sender's decision on the review it announces; an aborted task (cancelled, or the server closing) rejects all. */
function decision(run: ChangeRun, task: Task, engine: string, review: ChangeReview, changes: ReviewChange[]): Promise<ReviewDecision> {
  return new Promise((resolve) => {
    const decide = (value: ReviewDecision) => {
      task.decide = undefined
      resolve(value)
    }
    if (task.abort.signal.aborted) return decide({ accept: false })
    task.abort.signal.addEventListener('abort', () => decide({ accept: false }), { once: true })
    task.decide = decide
    run.tasks.push(task, { type: 'review', engine, changes, steps: [...review.steps()] })
  })
}

export async function runChange(run: ChangeRun, task: Task, request: AgentTaskRequest): Promise<void> {
  const { ctx, tasks } = run
  const locale = deckLocale(ctx.lang)
  const t = ASSISTANT_MESSAGES[locale]
  const revisions = ctx.service(REVISIONS)
  const service = ctx.service(CHANGE_REVIEW)
  const engine = service?.engine ?? GIT_ENGINE
  let review: ChangeReview
  try {
    if (!revisions) throw new Error(t.noChanges)
    review = service
      ? await service.open({ document: task.document, task: task.id, member: task.member })
      : await openGitReview({ workspaceRoot: ctx.workspaceRoot, deckDir: ctx.deckDir })
  } catch (error) {
    return tasks.end(task, { type: 'error', message: t.noReview(errorMessage(error)) })
  }
  const annotations = request.annotations ?? []
  for (const annotation of annotations) tasks.push(task, { type: 'annotation', id: annotation.id, status: 'sent' })
  const fail = (note: string) => {
    for (const annotation of annotations) tasks.push(task, { type: 'annotation', id: annotation.id, status: 'failed', note })
  }

  let terminal: AgentEvent = { type: 'done' }
  let settled = false
  try {
    const messages = await run.agent(task, review.root, request, async (event) => {
      tasks.push(task, event)
      // A checkpoint after each tool call the agent completed.
      if (event.type === 'progress' && event.status === 'completed' && !task.abort.signal.aborted) {
        tasks.push(task, { type: 'step', step: await review.step(event.tool ?? event.text, event.tool) })
      }
    })
    if (task.abort.signal.aborted) {
      fail(t.rejectedNote)
      return
    }
    const text = messages.join('\n\n')
    const notes = annotationNotes(text)
    for (const annotation of annotations) {
      const reported = notes.get(annotation.id)
      tasks.push(task, { type: 'annotation', id: annotation.id, status: reported?.failed ? 'failed' : 'done', ...reported?.note ? { note: reported.note } : {} })
    }

    const changes = await review.diff()
    if (changes.length === 0 && !task.allowed?.size) return
    const decided: ReviewDecision = reviewMode(ctx.settings) === 'auto' ? { accept: true } : await decision(run, task, engine, review, changes)
    if (!decided.accept) {
      await review.rollback()
      settled = true
      fail(t.rejectedNote)
      return
    }
    const reject = new Set<string>(decided.reject ?? [])
    // The workspace configuration is in the document directory of a single-deck repository only: an owner allows it first.
    if (changes.some(change => change.path === WORKSPACE_CONFIG) && !reject.has(WORKSPACE_CONFIG)) {
      const allowed = await run.ask(task, { kind: 'write', scope: 'workspace', title: t.approval.config(WORKSPACE_CONFIG), from: `agent:${task.id}`, member: task.member.id })
      if (!allowed) reject.add(WORKSPACE_CONFIG)
    }
    const kept = await review.accept([...reject])
    settled = true
    // The writes outside the directory owners allowed are not in the review: they are committed with it.
    const root = resolve(ctx.workspaceRoot)
    const outside = [...task.allowed ?? []].filter(path => within(path, root) && !within(path, resolve(ctx.deckDir))).map(path => relative(root, path).split(sep).join('/')).filter(path => path && !path.startsWith('.git/'))
    const revision = await revisions!.commit({
      files: [...new Set([...kept, ...outside])],
      message: commitMessage(request, notes, explanationOf(text), locale),
      origin: { kind: 'agent', task: task.id, member: task.member },
    })
    terminal = { type: 'done', ...revision ? { revision: revision.id } : {} }
  } catch (error) {
    if (!task.abort.signal.aborted) terminal = { type: 'error', message: errorMessage(error) }
    fail(task.abort.signal.aborted ? t.rejectedNote : errorMessage(error))
  } finally {
    // Not accepted (failed, cancelled, the server closing): the directory as the task found it.
    if (!settled) await review.rollback().catch((error: unknown) => ctx.log.warn(`the review of task ${task.id} did not roll back: ${errorMessage(error)}`))
    await review.close().catch((error: unknown) => ctx.log.warn(`the review of task ${task.id} did not close: ${errorMessage(error)}`))
    tasks.end(task, terminal)
  }
}
