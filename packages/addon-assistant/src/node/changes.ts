import { realpathSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { deckLocale, errorMessage, REVISIONS } from '@presmium/kernel'
import type { AgentEvent, AgentTaskRequest, ApprovalRequest, ChangeReview, ChangeReviewService, ReviewChange, ReviewDecision, ServerContext } from '@presmium/kernel'
import { annotationNotes, ASSISTANT_MESSAGES, commitMessage, explanationOf, reviewMode, reviewTimeoutMs, WORKSPACE_CONFIG } from '../domain/index.ts'
import { inside as within } from './paths.ts'
import type { Task, Tasks } from './tasks.ts'

export interface ChangeRun {
  ctx: ServerContext
  tasks: Tasks
  reviews?: ChangeReviewService
  agent(task: Task, cwd: string, request: AgentTaskRequest, onEvent: (event: AgentEvent) => Promise<void>): Promise<string[]>
  ask(task: Task, request: ApprovalRequest): Promise<boolean>
}

function decision(run: ChangeRun, task: Task, engine: string, review: ChangeReview, changes: ReviewChange[]): Promise<ReviewDecision> {
  const unattended = reviewTimeoutMs(run.ctx.settings)
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let restoring: Promise<void> | undefined
    const decide = (value: ReviewDecision) => {
      clearTimeout(timer)
      task.decide = task.restore = task.attended = undefined
      resolve(restoring ? restoring.then(() => value, () => value) : value)
    }
    if (task.abort.signal.aborted) return decide({ accept: false })
    task.abort.signal.addEventListener('abort', () => decide({ accept: false }), { once: true })
    task.decide = decide
    if (review.restoreTo) {
      task.restore = async (step: string) => {
        if (restoring) throw new Error(ASSISTANT_MESSAGES[deckLocale(run.ctx.lang)].restoring)
        restoring = (async () => {
          await review.restoreTo!(step)
          run.tasks.push(task, { type: 'review', engine, changes: await review.diff(), steps: [...review.steps()] })
        })()
        try {
          await restoring
        } finally {
          restoring = undefined
        }
      }
    }
    task.attended = () => {
      clearTimeout(timer)
      if (task.followers > 0) return
      timer = setTimeout(() => {
        run.ctx.log.info(`task ${task.id}: no page followed its review for ${Math.round(unattended / 1000)} s: rolled back`)
        task.abort.abort()
      }, unattended)
      timer.unref?.()
    }
    run.tasks.push(task, { type: 'review', engine, changes, steps: [...review.steps()] })
    task.attended()
  })
}

export async function runChange(run: ChangeRun, task: Task, request: AgentTaskRequest): Promise<void> {
  const { ctx, tasks } = run
  const locale = deckLocale(ctx.lang)
  const t = ASSISTANT_MESSAGES[locale]
  const revisions = ctx.service(REVISIONS)
  const service = run.reviews
  const engine = service?.engine ?? ''
  let review: ChangeReview
  try {
    if (!revisions || !service) throw new Error(t.noChanges)
    review = await service.open({ document: task.document, task: task.id, member: task.member })
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
    const accepted = await review.diff()
    for (const change of accepted) if (change.path.split('/').some(part => part.toLowerCase() === '.git')) reject.add(change.path)
    if (accepted.some(change => change.path === WORKSPACE_CONFIG) && !reject.has(WORKSPACE_CONFIG)) {
      const allowed = await run.ask(task, { kind: 'write', scope: 'workspace', title: t.approval.config(WORKSPACE_CONFIG), from: `agent:${task.id}`, member: task.member.id })
      if (task.abort.signal.aborted) {
        fail(t.rejectedNote)
        return
      }
      if (!allowed) reject.add(WORKSPACE_CONFIG)
    }
    const kept = await review.accept([...reject])
    settled = true
    const root = realpathSync(ctx.workspaceRoot)
    const outside = [...task.allowed ?? []].filter(path => within(path, root) && !within(path, realpathSync(ctx.deckDir))).map(path => relative(root, path).split(sep).join('/')).filter(path => path && !path.startsWith('.git/'))
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
    if (!settled) await review.rollback().catch((error: unknown) => ctx.log.warn(`the review of task ${task.id} did not roll back: ${errorMessage(error)}`))
    await review.close().catch((error: unknown) => ctx.log.warn(`the review of task ${task.id} did not close: ${errorMessage(error)}`))
    tasks.end(task, terminal)
  }
}
