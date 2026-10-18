// Routes of a test plugin (packages/addon-deltabox/test/review.test.ts) that drive the change review of
// the deck directory the way the assistant does: `open` takes CHANGE_REVIEW from the server's Node
// services, the others (`restore`: back to before a step) act on the review it opened. Plain objects: tokens are compared by id, so the
// fixture needs no package to compile.
import { relative } from 'node:path'

interface Context { deckDir: string, workspaceRoot: string, service(token: { id: string }): any }
interface RequestContext { member: { id: string, name: string, roles: string[] } }

const CHANGE_REVIEW = { id: 'presmium.changeReview' }

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

let review: any

/** Runs a route's work; an error becomes a 409 with its message. */
async function answer(work: () => Promise<unknown>): Promise<Response> {
  try {
    return json(await work() ?? {})
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 409)
  }
}

export default {
  id: 'fixture.review',
  version: '0.1.0',
  kernel: '^1.0.0',
  server: (ctx: Context) => ({
    routes: {
      'open': {
        handle: (_: Request, r: RequestContext) => answer(async () => {
          const service = ctx.service(CHANGE_REVIEW)
          if (!service) throw new Error('no CHANGE_REVIEW')
          // The deck directory, relative to the workspace root (in presmium dev the request's document is '').
          const opened = await service.open({ document: relative(ctx.workspaceRoot, ctx.deckDir), task: `task-${Date.now()}`, member: r.member })
          review = opened
          return { engine: service.engine, root: opened.root, visibility: opened.visibility }
        }),
      },
      'step': { handle: (request: Request) => answer(async () => review.step(((await request.json()) as { label: string }).label, 'edit')) },
      'diff': { handle: () => answer(async () => ({ changes: await review.diff(), steps: review.steps() })) },
      'restore': { handle: (request: Request) => answer(async () => review.restoreTo(((await request.json()) as { step: string }).step)) },
      'accept': { handle: (request: Request) => answer(async () => ({ files: await review.accept(((await request.json()) as { reject: string[] }).reject) })) },
      'rollback': { handle: () => answer(async () => review.rollback()) },
    },
  }),
}
