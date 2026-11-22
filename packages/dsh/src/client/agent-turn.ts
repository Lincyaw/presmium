import type { Workbench } from '@lincyaw/workbench'
import { mainViewAgentSession } from './document-context.ts'
import { MODEL_SETUP_PATHS } from '../model-providers.ts'
import type { TurnOutcome } from '../model-providers.ts'

/** As long as the server keeps a finished tool call: then the chip goes away. A failure stays until the next request. */
const SHOWN_MS = 6000
// Relative to the page: Studio may be served below a path (`--public-url`).
const TURN = MODEL_SETUP_PATHS.turn.replace(/^\//, '')

/**
 * Tells the workbench whether the chat on screen is working, from the host's running state of its session, and how
 * its turn ended once it stops. Nothing is shown before the first request.
 */
export function registerAgentTurn(ctx: DshClientContext, workbench: Workbench): void {
  ctx.inject(['sessions'], inner => inner.effect(() => {
    let session: string | undefined, running = false, clear: ReturnType<typeof setTimeout> | undefined, asked: AbortController | undefined
    const settle = (state: 'idle' | 'running' | 'done' | 'failed' | 'cancelled') => {
      if (clear !== undefined) { clearTimeout(clear); clear = undefined }
      workbench.setAgentTurn(state)
      if (state === 'done' || state === 'cancelled') clear = setTimeout(() => { clear = undefined; workbench.setAgentTurn('idle') }, SHOWN_MS)
    }
    const update = () => {
      const row = mainViewAgentSession(inner.sessions.list.getSnapshot().byId)
      const now = Boolean(row?.running)
      if (row?.id !== session) {
        asked?.abort()
        session = row?.id
        running = now
        settle(now ? 'running' : 'idle')
        return
      }
      if (now === running) return
      running = now
      asked?.abort()
      if (now) { settle('running'); return }
      const id = session!, controller = asked = new AbortController()
      void fetch(`${TURN}?session=${encodeURIComponent(id)}`, { signal: controller.signal })
        .then(response => response.ok ? response.json() as Promise<TurnOutcome | null> : null)
        .catch(() => null)
        .then(outcome => { if (!controller.signal.aborted) settle(outcome?.outcome ?? 'done') })
    }
    update()
    const off = inner.sessions.list.subscribe(update)
    return () => {
      off(); asked?.abort()
      if (clear !== undefined) clearTimeout(clear)
      workbench.setAgentTurn('idle')
    }
  }, 'presmium: whether the AI Assistant is working'))
}
