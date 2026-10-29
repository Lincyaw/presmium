import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { brandMarkup } from '@lincyaw/design'
import { PmButton, PmCard, PmDialog, PmEmpty, PmIcon, PmIconButton, PmInput, PmMenu, PmNotice, PmSkeleton, PmToolbar, PmToolbarButton } from '@lincyaw/workbench/components'
import { dateLabel, request, setCsrfToken } from './api.ts'
import type { AccessToken, Locale, SessionAnswer, Share, SharedDocument, Studio, WorkspaceDocument } from './api.ts'
import { CopyField, ErrorNotice, ResourceState, SectionHeading, Status } from './components.tsx'
import { useMutation, useResource } from './hooks.ts'
import { format, LANGUAGES, MESSAGES } from './messages.ts'
import type { Messages } from './messages.ts'

const MARK = { __html: brandMarkup() }
function readPreference(key: string): string | null { try { return localStorage.getItem(`presmium.cloud.${key}`) } catch { return null } }
function savePreference(key: string, value: string): void { try { localStorage.setItem(`presmium.cloud.${key}`, value) } catch { /* Preferences only. */ } }
function initialLocale(): Locale {
  const saved = readPreference('locale')
  if (saved === 'zh-CN' || saved === 'en') return saved
  return (navigator.language || '').startsWith('en') ? 'en' : 'zh-CN'
}
type Route = { page: 'home' } | { page: 'shared', slug: string }
function routeOf(): Route {
  const parts = window.location.pathname.split('/').filter(Boolean)
  if (parts[0] === 's' && parts[1]) return { page: 'shared', slug: parts[1] }
  return { page: 'home' }
}
export default function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const [dark, setDark] = useState(() => readPreference('theme') === 'dark' || (readPreference('theme') === null && window.matchMedia('(prefers-color-scheme: dark)').matches))
  const [route] = useState(routeOf)
  const session = useResource<SessionAnswer>('/api/me')
  const mutation = useMutation()
  const t = MESSAGES[locale]
  useEffect(() => { document.documentElement.lang = locale; document.title = t.pageTitle; savePreference('locale', locale) }, [locale, t.pageTitle])
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); savePreference('theme', dark ? 'dark' : 'light') }, [dark])
  useEffect(() => { setCsrfToken(session.data?.csrfToken); return () => setCsrfToken(undefined) }, [session.data?.csrfToken])
  const authenticationUrl = (action: 'login' | 'register') => `/api/auth/${action}?${new URLSearchParams({ returnTo: window.location.pathname, locale, theme: dark ? 'dark' : 'light' })}`
  const logout = () => void mutation.run(async () => {
    const answer = await request<{ logoutUrl?: string }>('/api/auth/logout', { method: 'POST' })
    setCsrfToken(undefined)
    window.location.assign(answer.logoutUrl ?? '/')
  })
  const user = session.data?.user
  return <div className="pmc-app pm-ui">
    <header className="pm-ui-appbar pmc-appbar">
      <a className="pmc-brand" href="/"><span aria-hidden="true" dangerouslySetInnerHTML={MARK} /><strong>{t.brand}</strong></a>
      <PmToolbar label={t.interfaceControls} className="pm-ui-toolbar pmc-header-actions">
        <PmMenu icon="language" label={t.language} toolbarItem items={LANGUAGES.map(language => ({ id: language.id, label: language.label, checked: locale === language.id }))} onSelect={id => setLocale(id as Locale)} />
        <PmToolbarButton asChild><PmIconButton small icon={dark ? 'sun' : 'moon'} label={dark ? t.light : t.dark} onClick={() => setDark(value => !value)} /></PmToolbarButton>
        {user && <PmMenu icon="account" label={t.account} description={user.name || user.email} toolbarItem items={[{ id: 'account', label: t.manageAccount, icon: 'account' }, { id: 'logout', label: t.logout, icon: 'logout', separator: true, disabled: mutation.pending }]} onSelect={id => { if (id === 'logout') logout(); else window.location.assign('/api/auth/account') }} />}
      </PmToolbar>
    </header>
    <main className="pmc-main">
      <ErrorNotice error={session.error || mutation.error} t={t} retry={session.error ? session.refresh : undefined} />
      {session.loading && !session.data && <PmSkeleton label={t.loading} />}
      {session.data && route.page === 'shared' && <SharedPage slug={route.slug} t={t} signedIn={Boolean(user)} loginUrl={authenticationUrl('login')} />}
      {session.data && route.page !== 'shared' && !user && <div className="pmc-welcome"><PmCard><h1 className="pm-ui-card__title">{t.welcomeTitle}</h1><p>{t.welcomeHint}</p><div className="pmc-actions"><PmButton variant="primary" onClick={() => window.location.assign(authenticationUrl('login'))}>{t.login}</PmButton><PmButton onClick={() => window.location.assign(authenticationUrl('register'))}>{t.register}</PmButton></div></PmCard></div>}
      {user && route.page === 'home' && <Home t={t} locale={locale} mcpUrl={session.data?.mcpUrl ?? ''} />}
    </main>
  </div>
}

function Home({ t, locale, mcpUrl }: { t: Messages, locale: Locale, mcpUrl: string }) {
  const studio = useResource<{ studio: Studio }>('/api/studio', 5000)
  const state = studio.data?.studio.state
  const documents = useResource<{ documents: WorkspaceDocument[] | null }>(state === 'running' ? '/api/documents' : undefined)
  const shares = useResource<{ shares: Share[] }>('/api/shares', 5000)
  const mutation = useMutation()
  const [sharing, setSharing] = useState<WorkspaceDocument>()
  return <div className="pmc-content">
    <PmCard>
      <SectionHeading title={t.studioTitle} description={t.studioHint}>{state && <Status status={state} t={t} />}</SectionHeading>
      <ResourceState resource={studio} t={t}>
        <div className="pmc-actions">
          {studio.data && <a className="pm-ui-button pm-ui-button--primary" href={studio.data.studio.url} target="_blank" rel="noopener"><PmIcon name="external" /><span>{t.openStudio}</span></a>}
          {(state === 'running' || state === 'starting') && <PmButton icon="stop" loading={mutation.pending} onClick={() => void mutation.run(async () => { await request('/api/studio/stop', { method: 'POST' }); studio.refresh() })}>{t.stopStudio}</PmButton>}
        </div>
        <p className="pm-ui-section-card__description">{t.studioIdleHint}</p>
        <ErrorNotice error={mutation.error} t={t} />
      </ResourceState>
    </PmCard>

    <PmCard>
      <SectionHeading title={t.documents} description={t.documentsHint}>{state === 'running' && <PmIconButton icon="refresh" label={t.refresh} onClick={documents.refresh} />}</SectionHeading>
      {state !== 'running' ? <PmEmpty icon="document">{t.documentsStopped}</PmEmpty> : <ResourceState resource={documents} t={t}>
        {documents.data?.documents?.length === 0 ? <PmEmpty icon="document">{t.noDocuments}</PmEmpty> : <ul className="pm-ui-document-list">{(documents.data?.documents ?? []).map(document => <li className="pm-ui-document-list__row" key={document.document}>
          <span className="pm-ui-document-list__icon"><PmIcon name="document" /></span>
          <a className="pm-ui-document-list__body" href={document.url} target="_blank" rel="noopener"><span className="pm-ui-document-list__title">{document.title}</span><span className="pm-ui-document-list__meta">{document.document}</span></a>
          <PmButton small icon="share" onClick={() => setSharing(document)}>{t.share}</PmButton>
        </li>)}</ul>}
      </ResourceState>}
    </PmCard>

    <PmCard>
      <SectionHeading title={t.shares} description={t.sharesHint} />
      <ResourceState resource={shares} t={t}>
        {shares.data?.shares.length === 0 ? <PmEmpty icon="share">{t.noShares}</PmEmpty> : <ul className="pmc-list">{(shares.data?.shares ?? []).map(share => <ShareRow key={share.id} share={share} t={t} locale={locale} onDeleted={shares.refresh} />)}</ul>}
      </ResourceState>
    </PmCard>

    <AccessTokens t={t} locale={locale} mcpUrl={mcpUrl} />
    {sharing && <ShareDialog document={sharing} t={t} onClose={() => setSharing(undefined)} onShared={shares.refresh} />}
  </div>
}

function shareLink(share: { slug: string }) { return new URL(`/s/${share.slug}`, window.location.origin).href }

function ShareRow({ share, t, locale, onDeleted }: { share: Share, t: Messages, locale: Locale, onDeleted(): void }) {
  const mutation = useMutation()
  return <li className="pmc-list__item">
    <div className="pmc-row"><div className="pmc-stack"><strong>{share.title}</strong><span className="pm-ui-section-card__description">{t.createdAt} {dateLabel(share.createdAt, locale)}</span></div>
      <div className="pmc-actions"><Status status={share.state === 'failed' ? 'failed' : share.state} t={t} />{share.state === 'ready' && <a className="pm-ui-button" href={shareLink(share)} target="_blank" rel="noopener"><PmIcon name="external" /><span>{t.openShare}</span></a>}<PmButton small loading={mutation.pending} onClick={() => void mutation.run(async () => { await request(`/api/shares/${share.id}`, { method: 'DELETE' }); onDeleted() })}>{t.deleteShare}</PmButton></div></div>
    {share.state === 'failed' && <PmNotice tone="danger">{t.shareFailed}</PmNotice>}
    {share.state !== 'failed' && <CopyField label={t.shareLink} value={shareLink(share)} t={t} />}
    <ErrorNotice error={mutation.error} t={t} />
  </li>
}

function ShareDialog({ document, t, onClose, onShared }: { document: WorkspaceDocument, t: Messages, onClose(): void, onShared(): void }) {
  const mutation = useMutation()
  const [share, setShare] = useState<Share>()
  return <PmDialog open label={format(t.shareTitle, { title: document.title })} closeLabel={t.close} busy={mutation.pending} onClose={onClose}>
    <div className="pmc-form">
      <p>{t.shareHint}</p>
      {share ? <CopyField label={t.shareLink} value={shareLink(share)} t={t} /> : <div className="pmc-actions"><PmButton onClick={onClose}>{t.cancel}</PmButton><PmButton variant="primary" loading={mutation.pending} onClick={() => void mutation.run(async () => { setShare((await request<{ share: Share }>('/api/shares', { method: 'POST', body: { document: document.document, title: document.title } })).share); onShared() })}>{t.createShare}</PmButton></div>}
      <ErrorNotice error={mutation.error} t={t} />
    </div>
  </PmDialog>
}

function AccessTokens({ t, locale, mcpUrl }: { t: Messages, locale: Locale, mcpUrl: string }) {
  const tokens = useResource<{ tokens: AccessToken[] }>('/api/tokens')
  const mutation = useMutation()
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [secret, setSecret] = useState<string>()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void mutation.run(async () => { setSecret((await request<{ token: { secret: string } }>('/api/tokens', { method: 'POST', body: { name: name.trim() } })).token.secret); setName(''); tokens.refresh() })
  }
  const close = () => { setCreating(false); setSecret(undefined); mutation.clear() }
  return <PmCard>
    <SectionHeading title={t.mcpTitle} description={t.mcpHint}><PmButton icon="plus" onClick={() => setCreating(true)}>{t.createToken}</PmButton></SectionHeading>
    <CopyField label={t.mcpAddress} value={mcpUrl} t={t} />
    <ResourceState resource={tokens} t={t}>
      {tokens.data?.tokens.length === 0 ? <PmEmpty icon="plug">{t.noTokens}</PmEmpty> : <ul className="pmc-list">{(tokens.data?.tokens ?? []).map(token => <li className="pmc-list__item pmc-row" key={token.id}>
        <div className="pmc-stack"><strong>{token.name}</strong><span className="pm-ui-section-card__description">{t.createdAt} {dateLabel(token.createdAt, locale)} · {t.lastUsed} {token.lastUsedAt ? dateLabel(token.lastUsedAt, locale) : t.never}</span></div>
        <PmButton small onClick={() => void mutation.run(async () => { await request(`/api/tokens/${token.id}`, { method: 'DELETE' }); tokens.refresh() })}>{t.revoke}</PmButton>
      </li>)}</ul>}
    </ResourceState>
    <PmDialog open={creating} label={t.tokens} closeLabel={t.close} busy={mutation.pending} onClose={close}>
      {secret ? <div className="pmc-form"><PmNotice tone="warn">{t.tokenCreated}</PmNotice><CopyField label={t.tokens} value={secret} t={t} secret /><CopyField label={t.tokenCommand} value={`claude mcp add --transport http presmium ${mcpUrl} --header "Authorization: Bearer ${secret}"`} t={t} secret /><div className="pmc-actions"><PmButton variant="primary" onClick={close}>{t.close}</PmButton></div></div>
        : <form className="pmc-form" onSubmit={submit}><PmInput label={t.tokenName} placeholder={t.tokenNamePlaceholder} value={name} onChange={event => setName(event.target.value)} maxLength={80} required autoFocus /><ErrorNotice error={mutation.error} t={t} /><div className="pmc-actions"><PmButton onClick={close}>{t.cancel}</PmButton><PmButton variant="primary" type="submit" loading={mutation.pending} disabled={!name.trim()}>{t.create}</PmButton></div></form>}
    </PmDialog>
  </PmCard>
}

function SharedPage({ slug, t, signedIn, loginUrl }: { slug: string, t: Messages, signedIn: boolean, loginUrl: string }) {
  const shared = useResource<{ share: SharedDocument }>(`/api/shared/${encodeURIComponent(slug)}`)
  const mutation = useMutation()
  const frame = useRef<HTMLIFrameElement>(null)
  const share = shared.data?.share
  return <div className="pmc-content">
    <ResourceState resource={shared} t={t}>{share && <>
      <PmCard>
        <SectionHeading title={share.title} description={format(t.sharedBy, { name: share.owner })}>
          {share.state === 'ready' && (signedIn
            ? <PmButton variant="primary" icon="copy" loading={mutation.pending} onClick={() => void mutation.run(async () => { const copy = await request<{ open: string }>(`/api/shared/${encodeURIComponent(slug)}/fork`, { method: 'POST' }); window.location.assign(copy.open) })}>{mutation.pending ? t.copying : t.makeCopy}</PmButton>
            : <PmButton variant="primary" onClick={() => window.location.assign(loginUrl)}>{t.loginToCopy}</PmButton>)}
        </SectionHeading>
        <p className="pm-ui-section-card__description">{t.makeCopyHint}</p>
        <ErrorNotice error={mutation.error} t={t} />
      </PmCard>
      {share.state === 'pending' && <PmNotice>{t.sharedPending}</PmNotice>}
      {share.state === 'failed' && <PmNotice tone="danger">{t.sharedFailed}</PmNotice>}
      {share.state === 'ready' && <iframe ref={frame} className="pmc-shared-frame" title={t.previewLabel} src={share.siteUrl} sandbox="allow-scripts allow-same-origin allow-popups" />}
    </>}</ResourceState>
  </div>
}
