import { Children, isValidElement, useState } from 'react'
import type { ReactNode } from 'react'
import { PmBadge, PmButton, PmChoiceSelect, PmField, PmInput, PmNotice, PmSkeleton, PmTextarea } from '@lincyaw/workbench/components'
import { failureMessage, useMutation } from './hooks.ts'
import type { RuntimeProfile, Locale } from './api.ts'
import type { Messages } from './messages.ts'

export function ErrorNotice({ error, t, retry }: { error: unknown, t: Messages, retry?: () => void }) {
  return error ? <PmNotice tone="danger"><div className="pmc-stack"><span>{failureMessage(error, t)}</span>{retry && <PmButton onClick={retry}>{t.retry}</PmButton>}</div></PmNotice> : null
}
export function ResourceState({ resource, t, children }: { resource: { loading: boolean, error?: unknown, data?: unknown, refresh(): void }, t: Messages, children: ReactNode }) {
  return <>{resource.loading && !resource.data && <PmSkeleton label={t.loading} shape="list" />}<ErrorNotice error={resource.error} t={t} retry={resource.refresh} />{resource.data !== undefined && children}</>
}
export function PageHeading({ title, description, eyebrow, children }: { title: string, description?: string, eyebrow?: string, children?: ReactNode }) {
  return <div className="pm-ui-page-heading pmc-heading"><div>{eyebrow && <p className="pm-ui-page-heading__eyebrow">{eyebrow}</p>}<h1 className="pm-ui-page-heading__title">{title}</h1>{description && <p className="pm-ui-page-heading__description">{description}</p>}</div><div className="pmc-actions">{children}</div></div>
}
export function Status({ status, t }: { status: string, t: Messages }) {
  const known = ['queued', 'starting', 'running', 'stopping', 'stopped', 'succeeded', 'failed', 'cancelled', 'reconciling', 'active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'incomplete_expired', 'canceled', 'none'] as const
  const label = known.includes(status as typeof known[number]) ? t[status as typeof known[number]] : t.unknownStatus
  return <PmBadge tone={['failed', 'unpaid', 'past_due'].includes(status) ? 'danger' : ['running', 'succeeded', 'active'].includes(status) ? 'ok' : ['starting', 'queued', 'reconciling'].includes(status) ? 'warn' : 'neutral'}>{label}</PmBadge>
}
export function Checkbox({ label, checked, onChange, disabled }: { label: string, checked: boolean, onChange(value: boolean): void, disabled?: boolean }) {
  return <PmField label={label} inline><input className="pm-ui-checkbox" type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /></PmField>
}
export function MutationError({ mutation, t }: { mutation: ReturnType<typeof useMutation>, t: Messages }) { return <ErrorNotice error={mutation.error} t={t} /> }

export function CopyField({ label, value, t, secret = false }: { label: string, value: string, t: Messages, secret?: boolean }) {
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false)
  return <div className="pmc-stack"><PmTextarea label={label} readOnly value={value} autoComplete="off" spellCheck={false} {...secret ? { 'data-sensitive': true } : {}} /><div className="pmc-actions"><PmButton icon={copied ? 'check' : 'copy'} onClick={() => { setFailed(false); void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => setFailed(true)); if (!navigator.clipboard) setFailed(true) }}>{copied ? t.copied : t.copy}</PmButton>{failed && <span role="status">{t.errorGeneric}</span>}</div></div>
}


/** Compatibility adapter for the cloud's existing option catalogs; the public control owns all UI. */
export function ChoiceField({ label, value, children, onChange, disabled, required, density = 'regular' }: {
  label: string, value: string, children: ReactNode, onChange(event: { target: { value: string } }): void,
  disabled?: boolean, required?: boolean, density?: 'compact' | 'regular' | 'touch',
}) {
  const choices = Children.toArray(children).flatMap(child => {
    if (!isValidElement<{ value?: string, disabled?: boolean, children?: ReactNode }>(child) || child.type !== 'option') return []
    const label = Children.toArray(child.props.children).join('')
    return [{ value: String(child.props.value ?? label), label, disabled: child.props.disabled }]
  })
  return <PmChoiceSelect label={label} value={value} choices={choices} onValueChange={value => onChange({ target: { value } })} disabled={disabled} required={required} density={density} />
}

export function profileLabel(profile: RuntimeProfile, t: Messages): string {
  if (profile.name && profile.name !== profile.id) return profile.name
  return profile.id === 'compile' ? t.profileStandard : profile.id === 'export' ? t.profileLarge : profile.id === 'jupyter-python' ? t.profilePython : profile.kind === 'jupyter' ? t.profileInteractive : t.profileCompute
}
export function profileDescription(profile: RuntimeProfile, t: Messages, locale: Locale): string {
  const format = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  return [profile.cpu !== undefined ? `${format.format(profile.cpu)} vCPU` : '', profile.memoryBytes !== undefined ? `${format.format(profile.memoryBytes / 1024 ** 2)} MiB ${t.profileMemory}` : '', profile.maxDurationSeconds !== undefined ? `${t.maximumRuntime} ${format.format(profile.maxDurationSeconds / 60)} ${t.minutes}` : ''].filter(Boolean).join(' · ')
}
