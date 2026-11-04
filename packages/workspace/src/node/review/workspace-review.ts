import { createHash } from 'node:crypto'
import { hasRole, WORKSPACE_REVIEW_FRAGMENT_CHARS, WORKSPACE_REVIEW_MAX_REQUEST_CHARS, WORKSPACE_REVIEW_MAX_RESPONSE_CHARS } from '@lincyaw/kernel'
import type { Member, WorkspaceReview, WorkspaceReviewAnswer, WorkspaceReviewChange } from '@lincyaw/kernel'
import { validateWorkspaceReviewChange, validateWorkspaceReviewQuery } from '@lincyaw/kernel/node'
import { RequestError } from '../errors.ts'
import type { AgentSessionReviews } from './agent-session-reviews.ts'

const size = (value: unknown) => JSON.stringify(value).length
const authorize = (member: Member) => { if (!hasRole(member, 'owner')) throw new RequestError(403, 'workspace-review-permission-denied') }
const budget = (value: unknown) => { if (size(value) > WORKSPACE_REVIEW_MAX_REQUEST_CHARS) throw new RequestError(413, 'workspace-review-request-too-large') }
const fits = (value: unknown) => size(value) <= WORKSPACE_REVIEW_MAX_RESPONSE_CHARS

/** Bounded publication interface over the same review queue, candidate trees and writer used by Web. */
export function createWorkspaceReview(reviews: AgentSessionReviews): WorkspaceReview {
  const inspect = async (change: WorkspaceReviewChange, member: Member) => {
    authorize(member); budget(change)
    if (!validateWorkspaceReviewChange(change)) throw new RequestError(400, 'workspace-review-change-invalid')
    const state = await reviews.inspect()
    if (!state || state.snapshot !== change.snapshot) throw new RequestError(409, 'workspace-review-changed')
    if (state.review.running) throw new RequestError(409, 'workspace-review-running')
    if (change.action === 'restore') {
      if (!state.review.steps.some(step => step.id === change.step)) throw new RequestError(404, 'workspace-review-step-not-found')
    } else {
      const selected = change.action === 'accept' ? change.reject : change.paths
      if (selected?.some(path => !state.review.changes.some(file => file.path === path))) throw new RequestError(409, 'workspace-review-path-changed')
    }
    return state
  }
  return {
    async read(query, member) {
      authorize(member); budget(query)
      if (!validateWorkspaceReviewQuery(query)) throw new RequestError(400, 'workspace-review-query-invalid')
      const part = query.part ?? 'summary', offset = query.offset ?? 0
      if ((query.path !== undefined || query.step !== undefined) && part !== 'diff' || offset > 0 && !query.snapshot || part === 'summary' && offset !== 0) throw new RequestError(400, 'workspace-review-query-invalid')
      const state = await reviews.inspect()
      if (query.snapshot !== undefined && state?.snapshot !== query.snapshot) throw new RequestError(409, 'workspace-review-changed')
      if (!state) {
        if (part !== 'summary') throw new RequestError(404, 'workspace-review-not-found')
        return { review: null }
      }
      const { review, snapshot } = state
      const answer: WorkspaceReviewAnswer = { review: { id: review.id, document: review.document, running: review.running, mode: review.mode, files: review.changes.length, steps: review.steps.length }, snapshot }
      if (!fits(answer)) throw new RequestError(413, 'workspace-review-response-too-large')
      if (part === 'summary') return answer
      if (part === 'diff') {
        if (!query.path) throw new RequestError(400, 'workspace-review-query-invalid')
        if (query.step && !review.steps.some(step => step.id === query.step)) throw new RequestError(404, 'workspace-review-step-not-found')
        const change = await reviews.readDiff(snapshot, query.path, query.step)
        if (!change) throw new RequestError(404, 'workspace-review-file-not-found')
        if (change.diff === undefined) throw new RequestError(409, 'workspace-review-diff-unavailable')
        const totalChars = change.diff.length
        if (offset > totalChars) throw new RequestError(400, 'workspace-review-query-invalid')
        answer.diff = { path: query.path, ...query.step ? { step: query.step } : {}, text: change.diff.slice(offset, offset + WORKSPACE_REVIEW_FRAGMENT_CHARS), offset, totalChars, sha256: createHash('sha256').update(change.diff).digest('hex') }
        const cursor = () => { if (offset + answer.diff!.text.length < totalChars) answer.nextOffset = offset + answer.diff!.text.length; else delete answer.nextOffset }
        cursor()
        while (!fits(answer) && answer.diff.text.length) { answer.diff.text = answer.diff.text.slice(0, Math.floor(answer.diff.text.length / 2)); cursor() }
        if (!fits(answer) || !answer.diff.text.length && offset < totalChars) throw new RequestError(413, 'workspace-review-response-too-large')
        return answer
      }
      const rows = part === 'files' ? review.changes : review.steps.map(({ changes, ...step }) => ({ ...step, label: step.label.slice(0, 240), ...step.tool ? { tool: step.tool.slice(0, 100) } : {}, files: changes.length }))
      if (offset > rows.length) throw new RequestError(400, 'workspace-review-query-invalid')
      const selected: unknown[] = []
      for (const row of rows.slice(offset, offset + 20)) {
        if (!fits({ ...answer, [part]: [...selected, row], nextOffset: offset + selected.length + 1 })) break
        selected.push(row)
      }
      if (!selected.length && offset < rows.length) throw new RequestError(413, 'workspace-review-response-too-large')
      Object.assign(answer, { [part]: selected }, offset + selected.length < rows.length ? { nextOffset: offset + selected.length } : {})
      return answer
    },
    async check(change, member) { await inspect(change, member); await reviews.check(change.snapshot) },
    async change(change, member, signal) {
      const state = await inspect(change, member)
      signal?.throwIfAborted()
      if (change.action === 'accept') {
        const ended = await reviews.accept(state.review.document, { reject: change.reject, message: change.message, expected: change.snapshot }, signal)
        return { outcome: ended.outcome === 'accepted' ? 'accepted' : 'empty', ...ended.revision ? { revision: ended.revision.id } : {}, files: ended.files.length }
      }
      if (change.action === 'reject') {
        const result = await reviews.reject(state.review.document, { paths: change.paths, expected: change.snapshot }, signal)
        return result.ended ? { outcome: 'rejected', files: result.ended.files.length } : { outcome: 'updated', remainingFiles: result.review?.changes.length ?? 0 }
      }
      const result = await reviews.restore(state.review.document, { step: change.step, expected: change.snapshot }, signal)
      return { outcome: 'restored', remainingFiles: result.changes.length }
    },
  }
}
