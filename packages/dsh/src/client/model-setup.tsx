import { PmBadge, PmButton, PmCard, PmInput, PmNotice, PmPanelHeader, WorkbenchProvider } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'
import { useEffect, useRef, useState } from 'react'
import { MODEL_SETTINGS } from './contract.ts'
import { CLIENT_MESSAGES, useClientMessages } from './messages.ts'
import type { ClientMessages } from './messages.ts'
import { mainViewAgentSession } from './document-context.ts'
import { MODEL_PROVIDERS, MODEL_SETUP_PATHS } from '../model-providers.ts'
import type { ModelProviderId, ModelProviderState, ModelSetupAnswer, ModelSetupFailure, ModelSetupRequest, ModelTestAnswer } from '../model-providers.ts'

// Relative to the page: Studio may be served below a path (`--public-url`).
const path = (route: string) => route.replace(/^\//, '')

async function post<T>(route: string, body: ModelSetupRequest, signal: AbortSignal): Promise<T | { failure: ModelSetupFailure }> {
  const response = await fetch(path(route), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal })
  const answer = await response.json().catch(() => undefined) as T | { failure?: ModelSetupFailure } | undefined
  if (!answer) return { failure: 'failed' }
  if (!response.ok) return { failure: (answer as { failure?: ModelSetupFailure }).failure ?? 'failed' }
  return answer as T
}

interface Draft { key: string, baseURL: string, model: string }

/** The address and model of "Other" are on its card; the others' are under Advanced. */
function failureText(m: ClientMessages['modelSetup'], failure: ModelSetupFailure, id: ModelProviderId): string {
  if (id === 'custom' && (failure === 'not-found' || failure === 'rejected')) return m.failures[`${failure}-here`]
  return m.failures[failure]
}
type Outcome = { tone: 'ok' | 'danger', text: string }

const EMPTY: Draft = { key: '', baseURL: '', model: '' }
/** The shortest a test shows that it is running. */
const TESTING_SHOWN_MS = 600

/**
 * Settings → Models in the author's terms: a short list of model services by their own names, each with where to get
 * an API key, how it is paid for, a key field and a connection test; the address, model and environment variable are
 * folded under Advanced.
 */
function ModelSetupPanel({ workbench, selectModel }: { workbench: Workbench, selectModel(selection: { provider: string, model: string }): void }) {
  const t = useClientMessages(workbench)
  const m = t.modelSetup
  const [answer, setAnswer] = useState<ModelSetupAnswer>()
  const [loading, setLoading] = useState(true)
  const [unavailable, setUnavailable] = useState(false)
  const [open, setOpen] = useState<ModelProviderId>()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [busy, setBusy] = useState<'test' | 'save'>()
  const [outcome, setOutcome] = useState<Outcome>()
  const request = useRef<AbortController>()

  const load = async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setUnavailable(false)
    try {
      const response = await fetch(path(MODEL_SETUP_PATHS.providers), { signal: controller.signal })
      if (!response.ok) throw new Error(String(response.status))
      const value = await response.json() as ModelSetupAnswer
      if (controller.signal.aborted) return
      setAnswer(value)
      // The first visit opens the one service the author would most likely set up.
      setOpen(current => current ?? (value.providers.some(provider => provider.configured) ? undefined : 'deepseek'))
    } catch {
      if (!controller.signal.aborted) setUnavailable(true)
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    return () => request.current?.abort()
  }, [])

  const toggle = (id: ModelProviderId) => {
    request.current?.abort()
    setBusy(undefined)
    setOutcome(undefined)
    setDraft(EMPTY)
    setOpen(current => current === id ? undefined : id)
  }

  const submit = async (state: ModelProviderState, action: 'test' | 'save') => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(action)
    setOutcome(undefined)
    const body: ModelSetupRequest = { id: state.id, ...draft.key.trim() ? { key: draft.key } : {}, ...draft.baseURL.trim() ? { baseURL: draft.baseURL } : {}, ...draft.model.trim() ? { model: draft.model } : {} }
    try {
      if (action === 'test') {
        // A repeated test that answers at once still shows that it ran.
        const [tested] = await Promise.all([post<ModelTestAnswer>(MODEL_SETUP_PATHS.test, body, controller.signal), new Promise(done => setTimeout(done, TESTING_SHOWN_MS))])
        if (controller.signal.aborted) return
        setOutcome('ok' in tested && tested.ok ? { tone: 'ok', text: m.connected } : { tone: 'danger', text: failureText(m, (tested as { failure: ModelSetupFailure }).failure, state.id) })
      } else {
        const saved = await post<ModelSetupAnswer & { selected: { provider: string, model: string } }>(MODEL_SETUP_PATHS.save, body, controller.signal)
        if (controller.signal.aborted) return
        if ('failure' in saved) {
          setOutcome({ tone: 'danger', text: failureText(m, saved.failure, state.id) })
          return
        }
        setAnswer(saved)
        setDraft(EMPTY)
        setOutcome({ tone: 'ok', text: m.saved.replace('{name}', m.names[state.id]) })
        selectModel(saved.selected)
      }
    } catch {
      if (!controller.signal.aborted) setOutcome({ tone: 'danger', text: action === 'test' ? m.failures.unreachable : m.failures.failed })
    } finally {
      if (!controller.signal.aborted) setBusy(undefined)
    }
  }

  return (
    <WorkbenchProvider workbench={workbench}>
      <section className="pmw-model-setup pm-ui" aria-label={m.title} data-pmw-model-setup="">
        <PmPanelHeader title={m.title} />
        <div className="pmw-model-setup__content">
          <p>{m.intro}</p>
          {loading && !answer && <PmNotice>{m.loading}</PmNotice>}
          {unavailable && <PmNotice tone="danger" action={<PmButton small onClick={() => void load()}>{m.retry}</PmButton>}>{m.unavailable}</PmNotice>}
          {answer && !answer.writable && <PmNotice tone="warn">{m.readOnly}</PmNotice>}
          {answer && (
            <ul className="pmw-model-setup__list">
              {answer.providers.map(state => (
                <li key={state.id}>
                  <ProviderCard t={t} state={state} open={open === state.id} writable={answer.writable} draft={draft} busy={busy} outcome={open === state.id ? outcome : undefined}
                    onToggle={() => toggle(state.id)} onDraft={change => { setDraft(current => ({ ...current, ...change })); setOutcome(undefined) }}
                    onTest={() => void submit(state, 'test')} onSave={() => void submit(state, 'save')} />
                </li>
              ))}
            </ul>
          )}
          <p className="pmw-model-setup__note">{m.privacy}</p>
        </div>
      </section>
    </WorkbenchProvider>
  )
}

function ProviderCard({ t, state, open, writable, draft, busy, outcome, onToggle, onDraft, onTest, onSave }: {
  t: ClientMessages
  state: ModelProviderState
  open: boolean
  writable: boolean
  draft: Draft
  busy?: 'test' | 'save'
  outcome?: Outcome
  onToggle(): void
  onDraft(change: Partial<Draft>): void
  onTest(): void
  onSave(): void
}) {
  const m = t.modelSetup
  const provider = MODEL_PROVIDERS.find(candidate => candidate.id === state.id)!
  const custom = state.id === 'custom'
  const status = state.active ? { tone: 'accent' as const, text: m.inUse } : state.configured ? { tone: 'ok' as const, text: m.configured } : { tone: 'neutral' as const, text: m.notSet }
  const bodyId = `pmw-model-setup-${state.id}`
  const keyPlaceholder = state.fromEnvironment ? m.keyFromEnvironment : state.configured ? m.keySaved : m.keyPlaceholder
  const address = <PmInput label={m.address} hint={custom ? m.addressHint : undefined} placeholder={state.baseURL || m.addressPlaceholder} value={draft.baseURL} disabled={!writable || Boolean(busy)} inputMode="url" autoComplete="off" spellCheck={false} maxLength={2048} onChange={event => onDraft({ baseURL: event.target.value })} />
  const model = <PmInput label={m.model} hint={m.modelHint} placeholder={state.model || m.modelPlaceholder} value={draft.model} disabled={!writable || Boolean(busy)} autoComplete="off" spellCheck={false} maxLength={200} onChange={event => onDraft({ model: event.target.value })} />
  const needsMore = custom && !state.configured && (!draft.baseURL.trim() || !draft.model.trim())
  const ready = (draft.key.trim() || state.configured) && !needsMore
  return (
    <PmCard className="pmw-model-setup__card" data-pmw-model-provider={state.id} data-open={open || undefined}>
      <div className="pmw-model-setup__head">
        <div className="pmw-model-setup__name">
          <h3>{m.names[state.id]}</h3>
          <PmBadge tone={status.tone}>{status.text}</PmBadge>
        </div>
        <PmButton small variant={open ? 'text' : 'default'} aria-expanded={open} aria-controls={bodyId} disabled={!writable && !open} onClick={onToggle}>{open ? (draft.key || draft.baseURL || draft.model ? m.cancel : t.close) : state.configured ? m.change : m.setUp}</PmButton>
      </div>
      {open && (
        <div className="pmw-model-setup__body" id={bodyId}>
          {custom ? <p>{m.customAbout}</p> : (
            <ol className="pmw-model-setup__steps">
              <li>{m.keyStep} <a className="pm-ui-link" href={provider.keyPage} target="_blank" rel="noreferrer">{m.keyLink}</a></li>
              <li>{m.cost} <a className="pm-ui-link" href={provider.pricePage} target="_blank" rel="noreferrer">{m.costLink}</a></li>
              <li>{m.pasteStep}</li>
            </ol>
          )}
          {custom && address}
          {custom && model}
          <PmInput type="password" label={m.key} placeholder={keyPlaceholder} value={draft.key} disabled={!writable || Boolean(busy)} autoComplete="new-password" spellCheck={false} maxLength={8192} onChange={event => onDraft({ key: event.target.value })} />
          {busy === 'test' ? <PmNotice>{m.testing}</PmNotice> : outcome && <PmNotice tone={outcome.tone}>{outcome.text}</PmNotice>}
          <div className="pmw-model-setup__actions">
            <PmButton small loading={busy === 'test'} disabled={!ready || Boolean(busy)} onClick={onTest}>{m.test}</PmButton>
            <PmButton small variant="primary" loading={busy === 'save'} disabled={!writable || !ready || Boolean(busy)} onClick={onSave}>{m.save}</PmButton>
          </div>
          <p className="pmw-model-setup__note">{custom ? m.customCost : m.testNote}</p>
          <details className="pmw-model-setup__advanced">
            <summary>{m.advanced}</summary>
            <div className="pmw-model-setup__fields">
              {!custom && address}
              {!custom && model}
              <p>{m.environment.replace('{name}', provider.key)}</p>
            </div>
          </details>
        </div>
      )}
    </PmCard>
  )
}

/**
 * Puts the author's Models page in Settings, where Harness's page would be (that page is off in the bundle's patch).
 * A save also selects the model for the chat on screen, so its next request uses it.
 */
export function registerModelSetup(ctx: DshClientContext, workbench: Workbench, refresh: () => void): void {
  ctx.inject(['sessions', 'remote', 'remote.session'], inner => inner.effect(() => inner.slots.inject('settings.section', () => {
    const selectModel = (selection: { provider: string, model: string }) => {
      refresh()
      const session = mainViewAgentSession(inner.sessions.list.getSnapshot().byId)
      if (session) void inner.remote.session.selectModel({ sessionId: session.id, ...selection }).catch(() => {})
    }
    return inner.slots.register({ name: 'settings.section', id: MODEL_SETTINGS.section, order: 10, label: () => CLIENT_MESSAGES[workbench.state.locale].modelSetup.title },
      () => <ModelSetupPanel workbench={workbench} selectModel={selectModel} />)
  }), 'presmium: the author\'s Models page'))
}
