/**
 * The review's routes of the workspace service (docs/design-dsh.md 5.1 and
 * 6.5, WP-96c), for editors and owners, of the request's document
 * (`Presmium-Document`, or `?document=`):
 *
 * - `GET review`: the document's review (`{ review? }`); asked as
 *   `text/event-stream`, the review now and each change of it (a page
 *   following it: no time runs out meanwhile).
 * - `POST review/open` `{ session, turn? }`: the session's review, opened
 *   before its first write (the document's lock is `agent:<session>`'s), or
 *   the one it has; 409 with the lock while another holds it.
 * - `POST review/step` `{ session, turn?, label?, tool?, end? }`: a checkpoint
 *   after a tool call (`label`), the end of the turn (`end`).
 * - `POST review/accept` `{ reject?, message? }`: one commit of the changes
 *   but the files of `reject`.
 * - `POST review/reject` `{ paths? }`: these files back as the review found
 *   them, or all of them.
 * - `POST review/restore` `{ step }`: back to before a step.
 * - `GET review/events`: SSE for the bundle: the reviews as they change, and
 *   the undo of a session's commit.
 */
import { eventStream, isRecord, json, problem } from '@presmium/kernel'
import type { Route } from '@presmium/kernel'
import type { Reviews } from './reviews.ts'

/** A request's JSON body, or `{}`. */
async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => undefined)
  return isRecord(body) ? body : {}
}

const text = (value: unknown, max = 4000) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined)
const turnOf = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined)
const paths = (value: unknown) => (Array.isArray(value) ? value.filter((path): path is string => typeof path === 'string' && path !== '') : undefined)

/** The routes; `answer` turns a `RequestError` into its answer, as the workspace's other routes do. */
export function reviewRoutes(reviews: Reviews, answer: (work: () => Promise<Response>) => Promise<Response>): Record<string, Route> {
  const post = (handle: (body: Record<string, unknown>, document: string) => Promise<Response>): Route => ({
    role: 'editor',
    handle: (request, ctx) => answer(async () => (request.method === 'POST' ? handle(await bodyOf(request), ctx.document) : problem(405, 'POST'))),
  })
  return {
    'review': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'GET') return problem(405, 'GET')
        if (request.headers.get('accept')?.includes('text/event-stream')) return eventStream(reviews.follow(ctx.document, request.signal), request.signal)
        const review = await reviews.view(ctx.document)
        return json(review ? { review } : {})
      }),
    },
    'review/events': {
      role: 'editor',
      handle: async (request) => (request.method === 'GET' ? eventStream(reviews.events(request.signal), request.signal) : problem(405, 'GET')),
    },
    'review/open': {
      role: 'editor',
      handle: (request, ctx) => answer(async () => {
        if (request.method !== 'POST') return problem(405, 'POST')
        const body = await bodyOf(request)
        const session = text(body.session, 200)
        if (!session) return problem(400, '{ session, turn? }')
        const turn = turnOf(body.turn)
        return json({ review: await reviews.open(ctx.document, { session, ...turn !== undefined ? { turn } : {} }, ctx.member) })
      }),
    },
    'review/step': post(async (body, document) => {
      const session = text(body.session, 200)
      if (!session) return problem(400, '{ session, turn?, label?, tool?, end? }')
      const turn = turnOf(body.turn)
      const review = await reviews.step(document, {
        session,
        ...turn !== undefined ? { turn } : {},
        ...text(body.label, 300) ? { label: text(body.label, 300)! } : {},
        ...text(body.tool, 100) ? { tool: text(body.tool, 100)! } : {},
        ...body.end === true ? { end: true } : {},
      })
      return json(review ? { review } : {})
    }),
    'review/accept': post(async (body, document) => {
      const reject = paths(body.reject)
      const message = text(body.message)
      return json({ ended: await reviews.accept(document, { ...reject ? { reject } : {}, ...message ? { message } : {} }) })
    }),
    'review/reject': post(async (body, document) => {
      const chosen = paths(body.paths)
      return json(await reviews.reject(document, chosen ? { paths: chosen } : {}))
    }),
    'review/restore': post(async (body, document) => {
      const step = text(body.step, 100)
      if (!step) return problem(400, '{ step }')
      return json({ review: await reviews.restore(document, { step }) })
    }),
  }
}
