import { CHANGE_REVIEW, errorMessage, json } from '@lincyaw/kernel'
import type { ChangeReview, PresmiumNodePlugin } from '@lincyaw/kernel'

export default {
  id: 'fixture.review',
  version: '1.0.0',
  kernel: '^1.0.0',
  server(ctx) {
    let review: ChangeReview | undefined
    return {
      routes: {
        task: {
          role: 'editor',
          async handle(request, scope) {
            const { op } = await request.json() as { op: 'open' | 'rollback' | 'close' }
            try {
              if (op === 'open') review = await ctx.service(CHANGE_REVIEW)!.open({ document: scope.document, task: 'fixture-task', member: scope.member })
              else await review![op]()
              return json({ root: review?.root })
            } catch (error) {
              return json({ error: errorMessage(error) }, 409)
            }
          },
        },
      },
      close: async () => review?.close(),
    }
  },
} satisfies PresmiumNodePlugin
