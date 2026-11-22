import { PmButton, PmIcon, WorkbenchProvider } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'
import { useState, useSyncExternalStore } from 'react'
import { ASSISTANT_SLOTS, MODEL_SETTINGS } from './contract.ts'
import { mainViewAgentSession } from './document-context.ts'
import { MODEL_SETUP_PATHS } from '../model-providers.ts'
import type { FailedRequest } from '../model-providers.ts'
import { CLIENT_MESSAGES, useClientMessages } from './messages.ts'
import type { ClientMessages } from './messages.ts'
import { createObservable } from './observable.ts'
import { openModelSettings } from './settings-opener.ts'

/** Whether the AI assistant has a model it can run on: unknown until Harness's model catalog has answered. */
export type AssistantReadiness = 'unknown' | 'ready' | 'missing'

/** Harness's model catalog (`session/modelCatalog`), as far as it is read here. */
interface ModelCatalogAnswer {
  ok: boolean
  value?: { routableProviders?: readonly string[] }
}

/** The end of a failed turn, as the `turn-error` chat node carries it. */
interface TurnErrorNode {
  data?: { turn?: number }
  location?: { turn?: { turn?: number, end?: { data?: { reason?: { kind?: string, error?: { message?: string, code?: string } } } } } }
}

/** Author-facing kinds of a failed turn, by the failure's stable code. */
type FailureKind = 'needsModel' | 'keyRejected' | 'quota' | 'busy' | 'tooLong' | 'stopped' | 'other'

const FAILURES: Record<string, FailureKind> = {
  MISSING_CREDENTIAL: 'needsModel',
  NO_ADAPTER: 'needsModel',
  AUTH: 'keyRejected',
  INVALID_CREDENTIAL: 'keyRejected',
  QUOTA: 'quota',
  ACCOUNT_QUOTA: 'quota',
  RATE_LIMIT: 'busy',
  OVERLOADED: 'busy',
  CONTEXT_WINDOW_EXCEEDED: 'tooLong',
}

/** The kinds whose recovery is in Settings → Models. */
const SETUP_KINDS = new Set<FailureKind>(['needsModel', 'keyRejected', 'quota'])

/** A request that failed for these reasons fails the same way when sent again in the same chat. */
const NO_RESEND = new Set<FailureKind>(['tooLong'])

// Relative to the page: Studio may be served below a path (`--public-url`).
const FAILED = MODEL_SETUP_PATHS.failed.replace(/^\//, '')

async function failedRequest(session?: string): Promise<FailedRequest | null> {
  const response = await fetch(session ? `${FAILED}?session=${encodeURIComponent(session)}` : FAILED)
  return response.ok ? await response.json() as FailedRequest | null : null
}

function failureOf(node: TurnErrorNode | undefined): { kind: FailureKind, message?: string, code?: string } {
  const reason = node?.location?.turn?.end?.data?.reason
  const error = reason?.error
  if (reason && reason.kind !== 'error') return { kind: 'stopped', message: error?.message, code: error?.code }
  return { kind: (error?.code && FAILURES[error.code]) || 'other', message: error?.message, code: error?.code }
}

function failureCopy(t: ClientMessages, kind: FailureKind): { title: string, body: string } {
  switch (kind) {
    case 'needsModel': return { title: t.needsModelTitle, body: t.needsModelTurn }
    case 'keyRejected': return { title: t.keyRejectedTitle, body: t.keyRejected }
    case 'quota': return { title: t.quotaTitle, body: t.quota }
    case 'busy': return { title: t.turnFailedTitle, body: t.busy }
    case 'tooLong': return { title: t.turnFailedTitle, body: t.tooLong }
    case 'stopped': return { title: t.turnStoppedTitle, body: t.turnStopped }
    case 'other': return { title: t.turnFailedTitle, body: t.turnFailed }
  }
}

/**
 * Keeps an author from sending a request the AI cannot run, and says in their terms why a turn failed.
 *
 * Readiness comes from Harness's model catalog: with no routable provider (no model set up, or no key for any) every
 * turn would fail, so the composer is taken over by a notice whose one action opens Settings → Models. The editor stays
 * mounted beneath the takeover, so a request typed before it appeared is still there afterwards. Failed turns are shown
 * with author copy (and the setup action where the fix is in Models) instead of the provider's diagnostic, which stays
 * behind a disclosure.
 */
export function registerAssistantSetup(ctx: DshClientContext, workbench: Workbench): AssistantSetup {
  const readiness = createObservable<AssistantReadiness>('unknown')
  let refresh = () => {}

  ctx.inject(['remote', 'remote.session'], inner => inner.effect(() => {
    let generation = 0
    let disposed = false
    const load = () => {
      const current = ++generation
      void inner.remote.session.modelCatalog().then((answer: ModelCatalogAnswer) => {
        if (disposed || current !== generation || !answer.ok) return
        const next = answer.value?.routableProviders?.length ? 'ready' : 'missing'
        if (next !== readiness.getSnapshot()) readiness.set(next)
      }, () => {})
    }
    refresh = load
    load()
    const offs = MODEL_SETTINGS.events.map(name => inner.on(name, load))
    const whileMissing = () => {
      if (readiness.getSnapshot() !== 'ready') load()
    }
    window.addEventListener('focus', load)
    const timer = window.setInterval(whileMissing, MODEL_SETTINGS.pollMs)
    return () => {
      disposed = true
      refresh = () => {}
      for (const off of offs) off()
      window.removeEventListener('focus', load)
      window.clearInterval(timer)
    }
  }, 'presmium: the assistant\'s model readiness'))

  // Before the settings shell has offered `openSection`, the app bar's own Settings button opens Settings.
  const openModels = () => {
    if (!openModelSettings()) document.querySelector<HTMLElement>('[data-activity="settings"]')?.click()
  }

  const [composer, chatNode] = ASSISTANT_SLOTS
  ctx.effect(() => ctx.slots.inject(composer, () => {
    let takeover: (() => void) | undefined
    const update = () => {
      const missing = readiness.getSnapshot() === 'missing'
      if (missing && !takeover) {
        takeover = ctx.slots.register({ name: composer, select: () => MISSING }, () => <NeedsModel workbench={workbench} openModels={openModels} />)
      } else if (!missing && takeover) {
        takeover()
        takeover = undefined
      }
    }
    update()
    const off = readiness.subscribe(update)
    return () => {
      off()
      takeover?.()
    }
  }), 'presmium: the composer explains a missing model')

  // Send Again repeats the failed request's own words in the chat on screen: the host keeps the last failed request of
  // each chat, and a request it does not know (one from before this version) is asked for again by reference.
  let resend: ((turn: number | undefined) => Promise<void>) | undefined
  ctx.inject(['sessions'], inner => inner.effect(() => {
    resend = async (turn) => {
      const row = mainViewAgentSession(inner.sessions.list.getSnapshot().byId)
      const binding = row && inner.sessions.binding(row.id)
      if (!row || !binding) throw new Error('no-conversation')
      const failed = await failedRequest(row.id).catch(() => null)
      const text = failed?.text && (turn === undefined || failed.turn === turn) ? failed.text : CLIENT_MESSAGES[workbench.state.locale].resendFallback
      const submission = binding.session.beginSubmission({ mode: 'queue', text, attachments: [] })
      try {
        const result = await binding.session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId)
        if (!result.ok) throw new Error(result.error.message)
      } catch (error) {
        submission.abandon()
        throw error
      }
    }
    return () => { resend = undefined }
  }, 'presmium: send a failed request again'))

  // A restarted Studio opens a blank chat; when the author's last request failed and nothing has finished since, the
  // chat that holds it is opened instead, so it can be sent again.
  ctx.inject(['sessions', 'uiWorkspace', 'remote', 'remote.session'], inner => inner.effect(() => {
    let settled = false
    let failed: Promise<FailedRequest | null> | undefined
    const check = () => {
      const main = mainViewAgentSession(inner.sessions.list.getSnapshot().byId)
      if (settled || !main) return
      settled = true
      failed ??= failedRequest().catch(() => null)
      void failed.then(async (request) => {
        if (!request || request.session === main.id) return
        const listed = await inner.remote.session.list({}).catch(() => undefined)
        if (!listed?.ok || !listed.value?.items.some(item => item.sessionId === request.session)) return
        if (mainViewAgentSession(inner.sessions.list.getSnapshot().byId)?.id !== main.id) return
        inner.uiWorkspace.openSession(request.session)
      })
    }
    failed = failedRequest().catch(() => null)
    const off = inner.sessions.list.subscribe(check)
    check()
    return off
  }, 'presmium: reopen the chat whose request failed'))

  ctx.effect(() => ctx.slots.inject(chatNode.name, () => ctx.slots.register({ name: chatNode.name, key: chatNode.key, priority: -1 }, ({ node }: { node?: TurnErrorNode }) => (
    <TurnFailure workbench={workbench} node={node} readiness={readiness} openModels={openModels} resend={turn => resend ? resend(turn) : Promise.reject(new Error('no-conversation'))} />
  ))), 'presmium: failed turns in the author\'s terms')

  return { readiness, refresh: () => refresh(), openModels }
}

export interface AssistantSetup {
  readiness: { getSnapshot(): AssistantReadiness, subscribe(listener: () => void): () => void }
  refresh(): void
  openModels(): void
}

const MISSING = Object.freeze({ reason: 'no-model' })

function NeedsModel({ workbench, openModels }: { workbench: Workbench, openModels(): void }) {
  const t = useClientMessages(workbench)
  return (
    <WorkbenchProvider workbench={workbench}>
      <div className="pmw-assistant-setup pm-ui" role="status" data-pmw-assistant-setup="needs-model">
        <span className="pmw-assistant-setup__icon"><PmIcon name="sliders" /></span>
        <div className="pmw-assistant-setup__copy">
          <p className="pmw-assistant-setup__title">{t.needsModelTitle}</p>
          <p>{t.needsModel}</p>
        </div>
        <div className="pmw-assistant-setup__actions">
          <PmButton variant="primary" onClick={openModels}>{t.models}</PmButton>
        </div>
      </div>
    </WorkbenchProvider>
  )
}

function TurnFailure({ workbench, node, readiness, openModels, resend }: { workbench: Workbench, node?: TurnErrorNode, readiness: AssistantSetup['readiness'], openModels(): void, resend(turn: number | undefined): Promise<void> }) {
  const t = useClientMessages(workbench)
  const failure = failureOf(node)
  const copy = failureCopy(t, failure.kind)
  const ready = useSyncExternalStore(readiness.subscribe, readiness.getSnapshot) === 'ready'
  const [sending, setSending] = useState<'sending' | 'sent' | 'failed'>()
  const turn = node?.data?.turn ?? node?.location?.turn?.turn
  const canResend = ready && !NO_RESEND.has(failure.kind) && sending !== 'sent'
  const sendAgain = () => {
    setSending('sending')
    resend(turn).then(() => setSending('sent'), () => setSending('failed'))
  }
  return (
    <WorkbenchProvider workbench={workbench}>
      <div className="pmw-turn-failure pm-ui" role="status" data-pmw-turn-failure={failure.kind}>
        <span className="pmw-turn-failure__mark" aria-hidden="true"><PmIcon name="warning" /></span>
        <div className="pmw-turn-failure__copy">
          <p className="pmw-turn-failure__title">{copy.title}</p>
          <p>{copy.body}</p>
          {(canResend || SETUP_KINDS.has(failure.kind)) && (
            <div className="pmw-turn-failure__actions">
              {canResend && <PmButton small variant="primary" icon="refresh" loading={sending === 'sending'} onClick={sendAgain}>{t.resend}</PmButton>}
              {SETUP_KINDS.has(failure.kind) && <PmButton small onClick={openModels}>{failure.kind === 'needsModel' ? t.models : t.checkModels}</PmButton>}
            </div>
          )}
          {sending === 'failed' && <p role="alert">{t.resendFailed}</p>}
          {(failure.message || failure.code) && (
            <details className="pmw-turn-failure__details">
              <summary>{t.failureDetails}</summary>
              <p>{[failure.message, failure.code].filter(Boolean).join(' · ')}</p>
            </details>
          )}
        </div>
      </div>
    </WorkbenchProvider>
  )
}
