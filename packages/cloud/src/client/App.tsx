import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { PmBadge, PmButton, PmCard, PmDialog, PmEmpty, PmField, PmIconButton, PmIcon, PmInput, PmMenu, PmNotice, PmSkeleton, PmToolbar, PmToolbarButton } from '@lincyaw/workbench/components'
import type { IconName } from '@lincyaw/design'
import { ApiError, dateLabel, followURL, money, request, setCsrfToken, spacePath } from './api.ts'
import type { AccessToken, CloudDocument, CreatedToken, Environment, Invitation, Locale, Member, Role, RuntimeProfile, SessionAnswer, Space, Usage } from './api.ts'
import { useMutation, useResource } from './hooks.ts'
import { MESSAGES } from './messages.ts'
import type { Messages } from './messages.ts'

import { DocumentPage } from './DocumentPage.tsx'
import { CloudShell } from './CloudShell.tsx'
import { EnvironmentStartDialog } from './EnvironmentStartDialog.tsx'
import { Checkbox, ChoiceField, CopyField, ErrorNotice, MutationError, PageHeading, ResourceState, Status } from './components.tsx'
type View = 'documents' | 'members' | 'access' | 'usage' | 'execution' | 'billing'
const VIEWS: { id: View, icon: IconName }[] = [{ id: 'documents', icon: 'document' }, { id: 'members', icon: 'people' }, { id: 'access', icon: 'plug' }, { id: 'usage', icon: 'overview' }, { id: 'execution', icon: 'code' }, { id: 'billing', icon: 'sliders' }]

function readPreference(key: string): string | null { try { return localStorage.getItem(`presmium.cloud.${key}`) } catch { return null } }
function savePreference(key: string, value: string): void { try { localStorage.setItem(`presmium.cloud.${key}`, value) } catch { /* Preferences do not gate editing. */ } }
function initialLocale(): Locale {
  const saved = readPreference('locale')
  if (saved === 'zh-CN' || saved === 'en') return saved
  const language = document.documentElement.lang || navigator.language
  return language.startsWith('en') ? 'en' : 'zh-CN'
}
function routeOf() {
  const parts = window.location.pathname.split('/').filter(Boolean)
  return { space: parts[0] === 'spaces' ? parts[1] : undefined, view: VIEWS.some(view => view.id === parts[2]) ? parts[2] as View : 'documents' as View, document: parts[2] === 'documents' ? parts[3] : undefined, invitation: parts[0] === 'invite' ? parts[1] : undefined }
}
export default function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale)
  const [dark, setDark] = useState(() => readPreference('theme') === 'dark' || (readPreference('theme') === null && window.matchMedia('(prefers-color-scheme: dark)').matches))
  const [route, setRoute] = useState(routeOf)
  const beforeLeave = useRef<(() => Promise<void>)>()
  const leaving = useRef(false)
  const currentPath = useRef(window.location.pathname)
  const [navigationError, setNavigationError] = useState<unknown>()
  const registerBeforeLeave = useCallback((leave?: () => Promise<void>) => { beforeLeave.current = leave }, [])
  const session = useResource<SessionAnswer>('/api/me')
  const spaces = useResource<{ spaces: Space[] }>(session.data?.user ? '/api/spaces' : undefined)
  const [createSpace, setCreateSpace] = useState(false)
  const [spaceName, setSpaceName] = useState('')
  const mutation = useMutation()
  const t = MESSAGES[locale]
  const selected = spaces.data?.spaces.find(space => space.id === route.space)
  const navigate = (space?: string, view: View = 'documents', documentId?: string) => {
    if (leaving.current) return
    const path = space ? `/spaces/${encodeURIComponent(space)}/${view}${documentId ? `/${encodeURIComponent(documentId)}` : ''}` : '/'
    leaving.current = true; setNavigationError(undefined)
    void Promise.resolve().then(() => beforeLeave.current?.()).then(() => {
      window.history.pushState({}, '', path); currentPath.current = path; setRoute(routeOf())
    }).catch(setNavigationError).finally(() => { leaving.current = false })
  }
  useEffect(() => {
    const changed = () => {
      const destination = window.location.pathname, next = routeOf()
      void Promise.resolve().then(() => beforeLeave.current?.()).then(() => { currentPath.current = destination; setRoute(next); setNavigationError(undefined) }).catch(error => {
        window.history.pushState({}, '', currentPath.current); setNavigationError(error)
      })
    }
    window.addEventListener('popstate', changed); return () => window.removeEventListener('popstate', changed)
  }, [])
  useEffect(() => { document.documentElement.lang = locale; document.title = t.pageTitle; savePreference('locale', locale) }, [locale, t.pageTitle])
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); savePreference('theme', dark ? 'dark' : 'light') }, [dark])
  useEffect(() => { setCsrfToken(session.data?.csrfToken); return () => setCsrfToken(undefined) }, [session.data?.csrfToken])
  useEffect(() => {
    if (!route.space && !route.invitation && spaces.data?.spaces[0]) {
      const space = spaces.data.spaces[0]
      const path = `/spaces/${encodeURIComponent(space.id)}/documents`
      window.history.replaceState({}, '', path); currentPath.current = path; setRoute(routeOf())
    }
  }, [route.space, route.invitation, spaces.data])
  const submitSpace = (event: FormEvent) => {
    event.preventDefault()
    void mutation.run(async () => {
      await beforeLeave.current?.()
      const answer = await request<{ space: Space }>('/api/spaces', { method: 'POST', body: { name: spaceName.trim() } })
      setCreateSpace(false); setSpaceName(''); spaces.refresh(); navigate(answer.space.id)
    })
  }
  const authenticationUrl = (action: 'login' | 'register' | 'verify-email') => `/api/auth/${action}?${new URLSearchParams({ returnTo: window.location.pathname, locale, theme: dark ? 'dark' : 'light' })}`
  const logout = () => void mutation.run(async () => {
    await beforeLeave.current?.()
    const answer = await request<{ logoutUrl?: string }>('/api/auth/logout', { method: 'POST' })
    setCsrfToken(undefined)
    followURL(answer.logoutUrl ?? '/')
  })
  return <><CloudShell t={t} locale={locale} authenticated={Boolean(session.data?.user)} invitation={Boolean(route.invitation)} spaces={spaces.data?.spaces ?? []} loading={spaces.loading} selected={selected} view={route.view} document={route.document} onNavigate={navigate} onCreate={() => { mutation.clear(); setCreateSpace(true) }} headerActions={<PmToolbar label={t.interfaceControls} className="pm-ui-toolbar pmc-header-actions">
        <PmMenu icon="language" label={t.language} toolbarItem items={[{ id: 'zh-CN', label: t.languageChinese, checked: locale === 'zh-CN' }, { id: 'en', label: t.languageEnglish, checked: locale === 'en' }]} onSelect={id => setLocale(id as Locale)} />
        <PmToolbarButton asChild><PmIconButton small icon={dark ? 'sun' : 'moon'} label={dark ? t.light : t.dark} onClick={() => setDark(value => !value)} /></PmToolbarButton>
        {session.data?.user && <PmMenu icon="account" label={t.account} description={session.data.user.name || session.data.user.email} toolbarItem items={[{ id: 'account', label: t.manageAccount, icon: 'account' }, { id: 'logout', label: t.logout, icon: 'logout', separator: true, disabled: mutation.pending }]} onSelect={id => { if (id === 'logout') logout(); else if (id === 'account') void mutation.run(async () => { await beforeLeave.current?.(); window.location.assign('/api/auth/account') }) }} />}
      </PmToolbar>}>
      <ErrorNotice error={session.error || mutation.error || navigationError} t={t} retry={session.error ? session.refresh : undefined} />
      {session.loading && !session.data && <PmSkeleton label={t.loading} />}
      {session.data && !session.data.user && <div className="pmc-welcome"><PmCard><h1 className="pm-ui-card__title">{t.subtitle}</h1><p>{t.loginHint}</p>{!session.data.capabilities.oidc && <PmNotice tone="warn">{t.authUnavailable}</PmNotice>}<div className="pmc-actions"><PmButton variant="primary" disabled={!session.data.capabilities.oidc} onClick={() => window.location.assign(authenticationUrl('login'))}>{t.login}</PmButton><PmButton disabled={!session.data.capabilities.oidc} onClick={() => window.location.assign(authenticationUrl('register'))}>{t.register}</PmButton></div></PmCard></div>}
      {session.data?.user && route.invitation && <InvitationPage token={route.invitation} t={t} loginUrl={authenticationUrl('login')} verifyUrl={authenticationUrl('verify-email')} onAccepted={spaceId => { spaces.refresh(); navigate(spaceId) }} />}
      {session.data?.user && !route.invitation && <>
        <ResourceState resource={spaces} t={t}>
          {spaces.data?.spaces.length === 0 && <PmEmpty icon="folder" title={t.noSpaces}>{t.noSpacesHint}</PmEmpty>}
          {route.space && spaces.data && !spaces.loading && !selected && <PmNotice tone="danger">{t.errorNotFound}</PmNotice>}
          {selected && <div className="pmc-content" key={`${selected.id}:${route.view}`}>
              {route.view === 'documents' && (route.document ? <DocumentPage space={selected} id={route.document} t={t} locale={locale} dark={dark} registerBeforeLeave={registerBeforeLeave} onBack={() => navigate(selected.id)} /> : <DocumentsPage space={selected} t={t} locale={locale} open={id => navigate(selected.id, 'documents', id)} />)}
              {route.view === 'members' && <MembersPage space={selected} t={t} locale={locale} userId={session.data.user.id} />}
              {route.view === 'access' && <TokensPage space={selected} t={t} locale={locale} />}
              {route.view === 'usage' && <UsagePage space={selected} t={t} locale={locale} />}
              {route.view === 'execution' && <ExecutionPage space={selected} t={t} locale={locale} userId={session.data.user.id} />}
              {route.view === 'billing' && <BillingPage space={selected} t={t} locale={locale} />}
          </div>}
        </ResourceState>
      </>}
    </CloudShell>
    <PmDialog open={createSpace} label={t.createSpace} closeLabel={t.close} busy={mutation.pending} onClose={() => setCreateSpace(false)}><form className="pmc-form" onSubmit={submitSpace}><PmInput label={t.spaceName} value={spaceName} onChange={event => setSpaceName(event.target.value)} maxLength={120} required autoFocus /><MutationError mutation={mutation} t={t} /><div className="pmc-actions"><PmButton onClick={() => setCreateSpace(false)} disabled={mutation.pending}>{t.cancel}</PmButton><PmButton variant="primary" type="submit" loading={mutation.pending} disabled={!spaceName.trim()}>{t.create}</PmButton></div></form></PmDialog>
  </>
}

function InvitationPage({ token, t, loginUrl, verifyUrl, onAccepted }: { token: string, t: Messages, loginUrl: string, verifyUrl: string, onAccepted(spaceId: string): void }) {
  const mutation = useMutation()
  const verify = mutation.error instanceof ApiError && mutation.error.code === 'verified-email-required'
  return <div className="pmc-welcome"><PmCard><h1 className="pm-ui-card__title">{t.invitationTitle}</h1><p>{t.invitationHint}</p><MutationError mutation={mutation} t={t} />{verify && <div className="pmc-form"><p>{t.verificationRefreshHint}</p><div className="pmc-actions"><PmButton icon="external" onClick={() => window.location.assign(verifyUrl)}>{t.verifyEmail}</PmButton><PmButton onClick={() => window.location.assign(loginUrl)}>{t.refreshLogin}</PmButton></div></div>}<PmButton variant="primary" loading={mutation.pending} onClick={() => void mutation.run(async () => { const answer = await request<{ spaceId: string }>(`/api/invitations/${encodeURIComponent(token)}/accept`, { method: 'POST' }); onAccepted(answer.spaceId) })}>{t.acceptInvite}</PmButton></PmCard></div>
}

function DocumentsPage({ space, t, locale, open }: { space: Space, t: Messages, locale: Locale, open(id: string): void }) {
  const resource = useResource<{ documents: CloudDocument[] }>(spacePath(space.id, 'documents'))
  const mutation = useMutation()
  const [creating, setCreating] = useState(false), [title, setTitle] = useState('')
  const [search, setSearch] = useState(''), [sort, setSort] = useState('recent')
  const documents = (resource.data?.documents ?? []).filter(document => document.title.toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale))).sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title, locale) : new Date(b.updatedAt ?? 0).valueOf() - new Date(a.updatedAt ?? 0).valueOf())
  const editable = space.role !== 'reader'
  return <>
    <PageHeading title={t.documents} description={t.documentsDescription} eyebrow={space.name}><PmIconButton icon="refresh" label={t.refresh} onClick={resource.refresh} />{editable && <PmButton variant="primary" icon="plus" onClick={() => { mutation.clear(); setCreating(true) }}>{t.createDocument}</PmButton>}</PageHeading>
    {!editable && <PmNotice>{t.readOnly}</PmNotice>}
    <div className="pmc-list-tools"><PmInput label={t.searchDocuments} placeholder={t.searchDocumentsPlaceholder} value={search} onChange={event => setSearch(event.target.value)} /><ChoiceField label={t.sortDocuments} value={sort} onChange={event => setSort(event.target.value)}><option value="recent">{t.sortRecent}</option><option value="title">{t.sortTitle}</option></ChoiceField></div>
    <ResourceState resource={resource} t={t}>{resource.data?.documents.length === 0 ? <PmCard><PmEmpty icon="document" title={t.noDocuments} action={editable ? <PmButton variant="primary" icon="plus" onClick={() => setCreating(true)}>{t.createDocument}</PmButton> : undefined}>{t.noDocumentsHint}</PmEmpty></PmCard> : documents.length === 0 ? <PmEmpty icon="search" title={t.noMatchingDocuments} action={<PmButton onClick={() => setSearch('')}>{t.clearSearch}</PmButton>} /> : <><p className="pm-ui-section-card__description">{t.documentResults.replace('{count}',new Intl.NumberFormat(locale).format(documents.length))}</p><ul className="pm-ui-document-list">{documents.map(document => <li className="pm-ui-document-list__row" key={document.id}><span className="pm-ui-document-list__icon"><PmIcon name="document" /></span><button className="pm-ui-document-list__body" onClick={() => open(document.id)} aria-label={`${t.openDocument}: ${document.title}`}><span className="pm-ui-document-list__title">{document.title}</span><span className="pm-ui-document-list__meta">{t.updated} · {dateLabel(document.updatedAt, locale)}</span></button><PmIconButton icon="chevron-right" label={`${t.openDocument}: ${document.title}`} onClick={() => open(document.id)} /></li>)}</ul></>}</ResourceState>
    <PmDialog open={creating} label={t.createDocument} closeLabel={t.close} busy={mutation.pending} onClose={() => setCreating(false)}><form className="pmc-form" onSubmit={event => { event.preventDefault(); void mutation.run(async () => { const answer = await request<{ document: CloudDocument }>(spacePath(space.id, 'documents'), { method: 'POST', body: { title: title.trim() } }); setCreating(false); resource.refresh(); open(answer.document.id) }) }}><PmInput label={t.documentTitle} value={title} onChange={event => setTitle(event.target.value)} required maxLength={240} autoFocus /><MutationError mutation={mutation} t={t} /><PmButton variant="primary" type="submit" disabled={!title.trim()} loading={mutation.pending}>{t.create}</PmButton></form></PmDialog>
  </>
}

function MembersPage({ space, t, locale, userId }: { space: Space, t: Messages, locale: Locale, userId: string }) {
  const resource = useResource<{ members: Member[], invitations?: Invitation[] }>(spacePath(space.id, 'members'))
  const mutation = useMutation()
  const [inviting, setInviting] = useState(false), [email, setEmail] = useState(''), [role, setRole] = useState<Role>('editor'), [canExecute, setCanExecute] = useState(false)
  const [created, setCreated] = useState<Invitation>(), [removing, setRemoving] = useState<{ path: string, name: string }>()
  const owner = space.role === 'owner'
  return <>
    <PageHeading title={t.members} description={t.membersDescription}><PmIconButton icon="refresh" label={t.refresh} onClick={resource.refresh} />{owner && <PmButton variant="primary" icon="plus" onClick={() => { mutation.clear(); setInviting(true) }}>{t.inviteMember}</PmButton>}</PageHeading>
    {!owner && <PmNotice>{t.ownerOnly}</PmNotice>}
    <ResourceState resource={resource} t={t}><PmCard><ul className="pm-ui-list">{resource.data?.members.map(member => <li key={member.userId}><div className="pmc-row"><div className="pmc-stack"><strong>{member.name || member.email || member.userId}</strong><div className="pmc-actions"><PmBadge>{t[member.role]}</PmBadge>{member.canExecute && <PmBadge>{t.canExecute}</PmBadge>}</div></div>{owner && member.role !== 'owner' && member.userId !== userId && <PmButton variant="ghost" onClick={() => { mutation.clear(); setRemoving({ path: `members/${encodeURIComponent(member.userId)}`, name: member.name || member.email || member.userId }) }}>{t.removeMember}</PmButton>}</div></li>)}</ul></PmCard>
      {Boolean(resource.data?.invitations?.length) && <PmCard><h2 className="pm-ui-card__title">{t.invitations}</h2><ul className="pm-ui-list">{resource.data?.invitations?.map(invitation => <li key={invitation.id}><div className="pmc-row"><div className="pmc-stack"><strong>{invitation.email}</strong><span>{t.expires} · {dateLabel(invitation.expiresAt, locale)}</span></div>{owner && <PmButton variant="ghost" onClick={() => { mutation.clear(); setRemoving({ path: `invitations/${encodeURIComponent(invitation.id)}`, name: invitation.email || invitation.id }) }}>{t.revoke}</PmButton>}</div></li>)}</ul></PmCard>}
    </ResourceState>
    <PmDialog open={inviting} label={t.inviteMember} closeLabel={t.close} busy={mutation.pending} onClose={() => setInviting(false)}><form className="pmc-form" onSubmit={event => { event.preventDefault(); void mutation.run(async () => { const answer = await request<{ invitation: Invitation }>(spacePath(space.id, 'members'), { method: 'POST', body: { email: email.trim(), role, canExecute: role === 'reader' ? false : canExecute, canSpend: false } }); setInviting(false); setCreated(answer.invitation); setEmail(''); resource.refresh() }) }}><PmInput label={t.email} type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" required autoFocus /><ChoiceField label={t.role} value={role} onChange={event => { setRole(event.target.value as Role); if (event.target.value === 'reader') { setCanExecute(false) } }}><option value="editor">{t.editor}</option><option value="reader">{t.reader}</option></ChoiceField><Checkbox label={t.canExecute} checked={canExecute} disabled={role === 'reader'} onChange={setCanExecute} /><MutationError mutation={mutation} t={t} /><PmButton type="submit" variant="primary" loading={mutation.pending}>{t.invite}</PmButton></form></PmDialog>
    <PmDialog open={Boolean(created)} label={t.inviteLink} closeLabel={t.close} onClose={() => setCreated(undefined)}><div className="pmc-stack"><p>{t.inviteHint}</p>{created?.url && <CopyField label={t.inviteLink} value={created.url} t={t} />}<span>{t.expires} · {dateLabel(created?.expiresAt, locale)}</span></div></PmDialog>
    <RevokeDialog target={removing} t={t} pending={mutation.pending} error={mutation.error} onClose={() => setRemoving(undefined)} onConfirm={() => void mutation.run(async () => { await request(spacePath(space.id, removing!.path), { method: 'DELETE' }); setRemoving(undefined); resource.refresh() })} />
  </>
}

function RevokeDialog({ target, t, pending, error, onClose, onConfirm }: { target?: { name: string }, t: Messages, pending: boolean, error: unknown, onClose(): void, onConfirm(): void }) {
  return <PmDialog open={Boolean(target)} label={t.confirmRevoke} closeLabel={t.close} busy={pending} onClose={onClose}><div className="pmc-stack"><strong>{target?.name}</strong><p>{t.confirmRevokeHint}</p><ErrorNotice error={error} t={t} /><div className="pmc-actions"><PmButton disabled={pending} onClick={onClose}>{t.cancel}</PmButton><PmButton variant="danger" loading={pending} onClick={onConfirm}>{t.revoke}</PmButton></div></div></PmDialog>
}

function TokensPage({ space, t, locale }: { space: Space, t: Messages, locale: Locale }) {
  const resource = useResource<{ tokens: AccessToken[] }>(spacePath(space.id, 'tokens'))
  const mutation = useMutation()
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [days, setDays] = useState('30'), [scopes, setScopes] = useState(['read']), [created, setCreated] = useState<CreatedToken['token']>(), [removing, setRemoving] = useState<AccessToken>()
  const owner = space.role === 'owner'
  const choices = [{ id: 'read', label: t.scopeRead, allowed: true }, { id: 'write', label: t.scopeWrite, allowed: space.role !== 'reader' }, { id: 'execute', label: t.scopeExecute, allowed: owner || space.canExecute }, { id: 'spend', label: t.scopeSpend, allowed: false }]
  const tokens = resource.data?.tokens.filter(token => !token.revokedAt) ?? []
  return <>
    <PageHeading title={t.access} description={t.accessDescription}><PmIconButton icon="refresh" label={t.refresh} onClick={resource.refresh} /><PmButton variant="primary" icon="plus" onClick={() => { mutation.clear(); setCreating(true) }}>{t.createToken}</PmButton></PageHeading>
    <div className="pmc-setup-grid"><PmCard className="pm-ui-section-card"><h2 className="pm-ui-section-card__heading">{t.connectStepsTitle}</h2><ol className="pm-ui-list pmc-setup-steps">{[{ title: t.connectStepOne, hint: t.connectStepOneHint }, { title: t.connectStepTwo, hint: t.connectStepTwoHint }, { title: t.connectStepThree, hint: t.connectStepThreeHint }].map((step, index) => <li className="pmc-setup-step" key={step.title}><PmBadge tone="accent">{index + 1}</PmBadge><div><strong>{step.title}</strong><p className="pm-ui-section-card__description">{step.hint}</p></div></li>)}</ol></PmCard><PmCard className="pm-ui-section-card"><h2 className="pm-ui-section-card__heading">{t.mcpURL}</h2><p className="pm-ui-section-card__description">{t.tokenHint}</p><CopyField label={t.mcpURL} value={new URL(`/mcp/${encodeURIComponent(space.id)}`, window.location.origin).href} t={t} /></PmCard></div>
    <ResourceState resource={resource} t={t}>{tokens.length === 0 ? <PmEmpty icon="plug" title={t.noTokens} /> : <PmCard><ul className="pm-ui-list">{tokens.map(token => <li key={token.id}><div className="pmc-row"><div className="pmc-stack"><strong>{token.name}</strong><div className="pmc-actions">{token.scopes.map(scope => <PmBadge key={scope}>{choices.find(choice => choice.id === scope)?.label ?? scope}</PmBadge>)}</div><span>{t.expires} · {dateLabel(token.expiresAt, locale)}</span><span>{t.lastUsed} · {dateLabel(token.lastUsedAt, locale)}</span></div><PmButton variant="ghost" onClick={() => { mutation.clear(); setRemoving(token) }}>{t.revoke}</PmButton></div></li>)}</ul></PmCard>}</ResourceState>
    <PmDialog open={creating} label={t.createToken} closeLabel={t.close} busy={mutation.pending} onClose={() => setCreating(false)}><form className="pmc-form" onSubmit={event => { event.preventDefault(); void mutation.run(async () => { const answer = await request<CreatedToken>(spacePath(space.id, 'tokens'), { method: 'POST', body: { name: name.trim(), scopes: scopes.filter(scope => choices.some(choice => choice.id === scope && choice.allowed)), expiresInDays: Number(days) } }); setCreating(false); setCreated(answer.token); setName(''); resource.refresh() }) }}><PmInput label={t.tokenName} value={name} onChange={event => setName(event.target.value)} maxLength={120} required autoFocus /><PmInput label={t.tokenLifetime} type="number" min={1} max={365} step={1} value={days} onChange={event => setDays(event.target.value)} required /><PmField group label={t.tokenScopes}><div className="pmc-stack">{choices.filter(choice => choice.allowed).map(choice => <Checkbox key={choice.id} label={choice.label} checked={scopes.includes(choice.id)} onChange={checked => setScopes(previous => checked ? [...previous, choice.id] : previous.filter(scope => scope !== choice.id))} />)}</div></PmField><MutationError mutation={mutation} t={t} /><PmButton type="submit" variant="primary" loading={mutation.pending} disabled={!name.trim() || scopes.length === 0}>{t.create}</PmButton></form></PmDialog>
    <PmDialog open={Boolean(created)} label={t.tokenCreated} closeLabel={t.close} onClose={() => setCreated(undefined)}><div className="pmc-stack"><PmNotice tone="warn">{t.tokenOnce}</PmNotice>{created && <><CopyField label={t.mcpURL} value={created.url} t={t} /><CopyField label={t.tokenSecret} value={created.secret} secret t={t} /><p>{t.tokenAuth}</p></>}</div></PmDialog>
    <RevokeDialog target={removing} t={t} pending={mutation.pending} error={mutation.error} onClose={() => setRemoving(undefined)} onConfirm={() => void mutation.run(async () => { await request(spacePath(space.id, `tokens/${encodeURIComponent(removing!.id)}`), { method: 'DELETE' }); setRemoving(undefined); resource.refresh() })} />
  </>
}

function UsagePage({ space, t, locale }: { space: Space, t: Messages, locale: Locale }) {
  const resource = useResource<{ usage: Usage }>(spacePath(space.id, 'usage'))
  const usage = resource.data?.usage
  return <>
    <PageHeading title={t.usage} description={t.usageDescription}><PmIconButton icon="refresh" label={t.refresh} onClick={resource.refresh} /></PageHeading>
    <ResourceState resource={resource} t={t}>{usage && <>
      <PmCard><span className="pm-ui-field__label">{t.storageQuotaUsed}</span><strong className="pm-ui-page-heading__title">{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(usage.storageBytes / 1024 ** 2)} MiB</strong><p className="pm-ui-section-card__description">{t.storageUsageHint}</p>{usage.objectBytes !== undefined && usage.environmentReservedBytes !== undefined && <dl className="pmc-details"><div><dt>{t.storedObjects}</dt><dd>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(usage.objectBytes / 1024 ** 2)} MiB</dd></div><div><dt>{t.environmentReservedStorage}</dt><dd>{new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(usage.environmentReservedBytes / 1024 ** 2)} MiB</dd></div></dl>}</PmCard>
      <PmCard><PmBadge tone="ok">{t.coreCreationFree}</PmBadge><h2 className="pm-ui-section-card__heading">{t.freeCreationTitle}</h2><p className="pm-ui-section-card__description">{t.freeCreationHint}</p></PmCard>
      <PmCard><h2 className="pm-ui-section-card__heading">{t.aiUsageTitle}</h2><p className="pm-ui-section-card__description">{t.aiUnavailableHint}</p><PmBadge>{t.aiNotAvailable}</PmBadge></PmCard>
      {Boolean(usage.ledger?.some(entry => entry.amountMinor !== 0)) && <PmCard><h2 className="pm-ui-section-card__heading">{t.historicalUsageTitle}</h2><p className="pm-ui-section-card__description">{t.historicalUsageHint}</p><ul className="pm-ui-list">{usage.ledger?.filter(entry => entry.amountMinor !== 0).map(entry => <li key={entry.id}><div className="pmc-row"><div className="pmc-stack"><PmBadge tone={entry.kind === 'refund' ? 'ok' : 'neutral'}>{entry.kind === 'refund' ? t.usageRefund : entry.kind === 'reserve' ? t.usageReserve : entry.kind === 'settle' ? t.usageSettle : entry.kind === 'release' ? t.usageRelease : t.usageOther}</PmBadge><span className="pm-ui-field__hint">{dateLabel(entry.createdAt, locale)}</span></div><strong>{money(entry.amountMinor, entry.currency, locale)}</strong></div></li>)}</ul></PmCard>}
    </>}</ResourceState>
  </>
}

function BillingPage({ space: _space, t, locale: _locale }: { space: Space, t: Messages, locale: Locale }) {
  return <>
    <PageHeading title={t.billing} description={t.billingDescription} />
    <PmCard><PmBadge tone="ok">{t.coreCreationFree}</PmBadge><h2 className="pm-ui-section-card__heading">{t.freeCreationTitle}</h2><p className="pm-ui-section-card__description">{t.freeCreationHint}</p><ul className="pm-ui-list"><li>{t.freeEditingFeature}</li><li>{t.freePreviewFeature}</li><li>{t.freeExportFeature}</li></ul></PmCard>
    <PmCard><div className="pmc-row"><h2 className="pm-ui-section-card__heading">{t.aiServiceTitle}</h2><PmBadge>{t.aiNotAvailable}</PmBadge></div><p className="pm-ui-section-card__description">{t.aiUnavailableHint}</p><p className="pm-ui-field__hint">{t.aiBillingBoundary}</p><PmButton disabled icon="sparkle">{t.aiNotAvailable}</PmButton></PmCard>
    <PmCard><h2 className="pm-ui-section-card__heading">{t.externalAiTitle}</h2><p className="pm-ui-section-card__description">{t.externalAiHint}</p><PmButton icon="plug" onClick={() => followURL(`/spaces/${encodeURIComponent(_space.id)}/access`)}>{t.openAiConnection}</PmButton></PmCard>
  </>
}

function ExecutionPage({ space, t, locale, userId }: { space: Space, t: Messages, locale: Locale, userId: string }) {
  const canExecute = space.role === 'owner' || Boolean(space.canExecute)
  const profiles = useResource<{ profiles: RuntimeProfile[] }>(canExecute ? '/api/runtime/profiles' : undefined)
  const environments = useResource<{ environments: Environment[] }>(canExecute ? spacePath(space.id, 'environments') : undefined, 5000)
  const mutation = useMutation()
  const [creating, setCreating] = useState(false), [name, setName] = useState(''), [stopping, setStopping] = useState<Environment>(), [starting, setStarting] = useState<Environment>(), [destroying, setDestroying] = useState<Environment>()
  const interactive = profiles.data?.profiles.filter(profile => profile.kind === 'jupyter' && profile.available !== false) ?? []
  const defaultProfile = interactive[0]
  const refresh = () => { environments.refresh(); profiles.refresh() }
  return <>
    <PageHeading title={t.execution} description={t.executionDescription}><PmIconButton icon="refresh" label={t.refresh} onClick={refresh} />{canExecute && <PmButton icon="plus" disabled={!defaultProfile} onClick={() => { setName(t.profilePython); setCreating(true); mutation.clear() }}>{t.createEnvironment}</PmButton>}</PageHeading>
    <MutationError mutation={mutation} t={t} /><ErrorNotice error={profiles.error} t={t} retry={profiles.refresh} />
    <p className="pm-ui-section-card__description">{t.environmentHint}</p>
    {!canExecute && <PmNotice>{t.executionPermissionHint}</PmNotice>}
    {canExecute && profiles.data && !defaultProfile && <PmNotice>{t.noProfiles}</PmNotice>}
    <ResourceState resource={environments} t={t}>{environments.data?.environments.length === 0 ? <PmEmpty icon="notebook" title={t.noEnvironments}>{t.environmentEmptyHint}</PmEmpty> : <PmCard><ul className="pm-ui-list">{environments.data?.environments.map(environment => {
      const owns = environment.ownerId === userId, manages = owns || space.role === 'owner'
      return <li key={environment.id}><div className="pmc-row"><div className="pmc-stack"><strong>{environment.name || t.profilePython}</strong><Status status={environment.status} t={t} /><span className="pm-ui-field__hint">{dateLabel(environment.updatedAt || environment.createdAt, locale)}</span></div><div className="pmc-actions">{environment.status === 'running' && owns && <PmButton icon="external" disabled={!environment.url} onClick={() => followURL(environment.url!, true)}>{t.openJupyter}</PmButton>}{['stopped', 'failed'].includes(environment.status) && owns && <PmButton icon="play" disabled={mutation.pending} onClick={() => setStarting(environment)}>{t.start}</PmButton>}{['stopped', 'failed'].includes(environment.status) && manages && <PmButton variant="ghost" disabled={mutation.pending} onClick={() => { setDestroying(environment); mutation.clear() }}>{t.deleteEnvironment}</PmButton>}{['starting', 'running'].includes(environment.status) && manages && <PmButton disabled={mutation.pending} onClick={() => { setStopping(environment); mutation.clear() }}>{t.stop}</PmButton>}</div></div></li>
    })}</ul></PmCard>}</ResourceState>
    <PmDialog open={creating} label={t.createEnvironment} closeLabel={t.close} busy={mutation.pending} onClose={() => setCreating(false)}><form className="pmc-form" onSubmit={event => { event.preventDefault(); if (!defaultProfile) return; void mutation.run(async () => { await request(spacePath(space.id, 'environments'), { method: 'POST', body: { profileId: defaultProfile.id, name: name.trim() } }); setCreating(false); environments.refresh() }) }}><PmInput label={t.environmentName} value={name} onChange={event => setName(event.target.value)} required maxLength={100} autoFocus /><p className="pm-ui-section-card__description">{t.environmentCreateHint}</p><MutationError mutation={mutation} t={t} /><PmButton type="submit" variant="primary" disabled={!defaultProfile || !name.trim()} loading={mutation.pending}>{t.create}</PmButton></form></PmDialog>
    <PmDialog open={Boolean(stopping)} label={t.stopEnvironment} closeLabel={t.close} busy={mutation.pending} onClose={() => setStopping(undefined)}><div className="pmc-form"><p>{t.stopEnvironmentHint}</p><MutationError mutation={mutation} t={t} /><div className="pmc-actions"><PmButton disabled={mutation.pending} onClick={() => setStopping(undefined)}>{t.cancel}</PmButton><PmButton variant="danger" loading={mutation.pending} onClick={() => void mutation.run(async () => { await request(spacePath(space.id, `environments/${encodeURIComponent(stopping!.id)}/stop`), { method: 'POST' }); setStopping(undefined); environments.refresh() })}>{t.stop}</PmButton></div></div></PmDialog>
    <PmDialog open={Boolean(destroying)} label={t.deleteEnvironment} closeLabel={t.close} busy={mutation.pending} onClose={() => setDestroying(undefined)}><div className="pmc-form"><strong>{destroying?.name}</strong><PmNotice tone="danger">{t.deleteEnvironmentHint}</PmNotice><MutationError mutation={mutation} t={t} /><div className="pmc-actions"><PmButton disabled={mutation.pending} onClick={() => setDestroying(undefined)}>{t.cancel}</PmButton><PmButton variant="danger" loading={mutation.pending} onClick={() => void mutation.run(async () => { await request(spacePath(space.id, `environments/${encodeURIComponent(destroying!.id)}`), { method: 'DELETE' }); setDestroying(undefined); environments.refresh() })}>{t.deleteEnvironment}</PmButton></div></div></PmDialog>
    {starting && <EnvironmentStartDialog space={space} environment={starting} maxDurationSeconds={interactive.find(profile => profile.id === starting.profileId)?.maxDurationSeconds} t={t} locale={locale} onClose={() => setStarting(undefined)} onStarted={() => { setStarting(undefined); environments.refresh() }} />}
  </>
}
