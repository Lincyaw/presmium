import { eventStream, isRecord, json, problem } from '@lincyaw/kernel'
import type { Route } from '@lincyaw/kernel'
import type { Reviews } from './reviews.ts'

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const body: unknown = await request.json().catch(() => undefined)
  return isRecord(body) ? body : {}
}

const text = (value: unknown, max = 4000) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined)
const turnOf = (value: unknown) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined)
const paths = (value: unknown) => (Array.isArray(value) ? value.filter((path): path is string => typeof path === 'string' && path !== '') : undefined)

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
        const review = await reviews.view()
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
