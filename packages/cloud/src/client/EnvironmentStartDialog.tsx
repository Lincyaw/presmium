import { useState } from 'react'
import { PmBadge, PmButton, PmCard, PmDialog, PmNotice } from '@lincyaw/workbench/components'
import { ApiError, request, spacePath } from './api.ts'
import type { Environment, Locale, Space } from './api.ts'
import { MutationError } from './components.tsx'
import { useMutation } from './hooks.ts'
import type { Messages } from './messages.ts'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
function load(key: string): string | undefined {
  try { const value = sessionStorage.getItem(key); if (value && uuid.test(value)) return value } catch { /* An unreadable receipt cannot start work. */ }
}
function save(key: string, requestId?: string): boolean {
  try {
    if (!requestId) { sessionStorage.removeItem(key); return true }
    sessionStorage.setItem(key, requestId)
    return sessionStorage.getItem(key) === requestId
  } catch { return false }
}

/** The finite runtime lease is free. A durable request ID recovers a lost start response. */
export function EnvironmentStartDialog({ space, environment, maxDurationSeconds, t, locale, onClose, onStarted }: { space: Space, environment: Environment, maxDurationSeconds?: number, t: Messages, locale: Locale, onClose(): void, onStarted(): void }) {
  const path = spacePath(space.id, `environments/${encodeURIComponent(environment.id)}`)
  const key = `presmium.cloud.environment-start:${space.id}:${environment.id}`
  const [requestId, setRequestId] = useState(() => load(key))
  const mutation = useMutation()
  const [storageFailure, setStorageFailure] = useState(false)
  const start = () => void mutation.run(async () => {
    const operation = requestId ?? crypto.randomUUID()
    if (!save(key, operation)) { setStorageFailure(true); return }
    setStorageFailure(false); setRequestId(operation)
    try {
      await request(`${path}/start`, { method: 'POST', body: { requestId: operation } })
      save(key); onStarted()
    } catch (error) {
      // Definite admission refusals did not start a lease. Network/5xx uncertainty retains the ID.
      if (error instanceof ApiError && ['runtime-profile-changed', 'runtime-generation-changed'].includes(error.code)) { save(key); setRequestId(undefined) }
      throw error
    }
  })
  return <PmDialog open label={t.startEnvironment} description={environment.name} closeLabel={t.close} busy={mutation.pending} onClose={onClose}><div className="pmc-form">
    <PmCard><PmBadge tone="ok">{t.coreCreationFree}</PmBadge><p>{t.environmentStartHint}</p>{maxDurationSeconds !== undefined && <dl className="pmc-details"><div><dt>{t.maximumRuntime}</dt><dd>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(maxDurationSeconds / 60)} {t.minutes}</dd></div></dl>}</PmCard>
    {requestId && !mutation.pending && <PmNotice tone="warn">{t.environmentStartUncertain}</PmNotice>}
    {storageFailure && <PmNotice tone="danger">{t.confirmationStorageUnavailable}</PmNotice>}
    <MutationError mutation={mutation} t={t} />
    <div className="pmc-actions"><PmButton disabled={mutation.pending} onClick={onClose}>{t.cancel}</PmButton><PmButton variant="primary" loading={mutation.pending} onClick={start}>{requestId && !mutation.pending ? t.recoverConfirmation : t.start}</PmButton></div>
  </div></PmDialog>
}
