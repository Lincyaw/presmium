import { useState } from 'react'
import type { ReactNode } from 'react'
import { PmBadge, PmButton, PmInput, PmNotice, PmSkeleton, PmTextarea } from '@lincyaw/workbench/components'
import { failureMessage } from './hooks.ts'
import type { Messages } from './messages.ts'

export function ErrorNotice({ error, t, retry }: { error: unknown, t: Messages, retry?: () => void }) {
  return error ? <PmNotice tone="danger"><div className="pmc-stack"><span>{failureMessage(error, t)}</span>{retry && <PmButton onClick={retry}>{t.retry}</PmButton>}</div></PmNotice> : null
}
export function ResourceState({ resource, t, children }: { resource: { loading: boolean, error?: unknown, data?: unknown, refresh(): void }, t: Messages, children: ReactNode }) {
  return <>{resource.loading && !resource.data && <PmSkeleton label={t.loading} shape="list" />}<ErrorNotice error={resource.error} t={t} retry={resource.refresh} />{resource.data !== undefined && children}</>
}
export function SectionHeading({ title, description, children }: { title: string, description?: string, children?: ReactNode }) {
  return <div className="pmc-heading"><div className="pmc-stack"><h2 className="pm-ui-card__title">{title}</h2>{description && <p className="pm-ui-section-card__description">{description}</p>}</div><div className="pmc-actions">{children}</div></div>
}
export function Status({ status, t }: { status: 'stopped' | 'starting' | 'running' | 'stopping' | 'failed' | 'pending' | 'ready', t: Messages }) {
  const label = status === 'failed' ? t.failed : t[status]
  return <PmBadge tone={status === 'failed' ? 'danger' : status === 'running' || status === 'ready' ? 'ok' : status === 'starting' || status === 'pending' ? 'warn' : 'neutral'}>{label}</PmBadge>
}
export function CopyField({ label, value, t, secret = false }: { label: string, value: string, t: Messages, secret?: boolean }) {
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false)
  return <div className="pmc-stack pmc-copy">{value.length > 80 ? <PmTextarea label={label} readOnly value={value} autoComplete="off" spellCheck={false} rows={3} {...secret ? { 'data-sensitive': true } : {}} /> : <PmInput label={label} readOnly value={value} autoComplete="off" spellCheck={false} {...secret ? { 'data-sensitive': true } : {}} />}<div className="pmc-actions"><PmButton icon={copied ? 'check' : 'copy'} onClick={() => { setFailed(false); if (!navigator.clipboard) { setFailed(true); return } void navigator.clipboard.writeText(value).then(() => setCopied(true), () => setFailed(true)) }}>{copied ? t.copied : t.copy}</PmButton>{failed && <span role="status">{t.errorGeneric}</span>}</div></div>
}
