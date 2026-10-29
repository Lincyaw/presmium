import type { MouseEvent, ReactNode } from 'react'
import { brandMarkup } from '@lincyaw/design'
import { PmBadge, PmIcon, PmMenu, PmWorkspaceSwitcher } from '@lincyaw/workbench/components'
import type { Locale, Space } from './api.ts'
import type { Messages } from './messages.ts'

export type CloudView = 'documents' | 'members' | 'access' | 'usage' | 'execution' | 'billing'
export const CLOUD_VIEWS = [
  { id: 'documents', icon: 'document' }, { id: 'members', icon: 'people' },
  { id: 'access', icon: 'plug' }, { id: 'execution', icon: 'code' },
  { id: 'usage', icon: 'overview' }, { id: 'billing', icon: 'sliders' },
] as const
const MARK = { __html: brandMarkup() }

export function CloudShell({ t, locale, authenticated, invitation, spaces, loading, selected, view, document, headerActions, onNavigate, onCreate, children }: {
  t: Messages, locale: Locale, authenticated: boolean, invitation: boolean, spaces: Space[], loading: boolean,
  selected?: Space, view: CloudView, document?: string, headerActions: ReactNode,
  onNavigate(space?: string, view?: CloudView): void, onCreate(): void, children: ReactNode,
}) {
  const hasShell = authenticated && !invitation
  const switcher = <PmWorkspaceSwitcher label={t.chooseSpace} value={selected?.id ?? ''} items={spaces.map(space => ({ value: space.id, label: space.name, description: t[space.role], icon: 'folder' }))} onValueChange={id => onNavigate(id)} placeholder={t.chooseSpace} searchLabel={t.searchSpaces} searchPlaceholder={t.searchSpacesPlaceholder} emptyLabel={t.noMatchingSpaces} resultsLabel={count => t.spaceResults.replace('{count}', new Intl.NumberFormat(locale).format(count))} loading={loading} loadingLabel={t.loading} createLabel={t.createSpace} onCreate={onCreate} />
  const navigation = <PmMenu icon="navigation" label={t.navigation} description={selected?.name} items={CLOUD_VIEWS.map(item => ({ id: item.id, icon: item.icon, label: t[item.id], checked: item.id === view }))} onSelect={id => { if (selected && CLOUD_VIEWS.some(item => item.id === id)) onNavigate(selected.id, id as CloudView) }} />
  const link = (event: MouseEvent<HTMLAnchorElement>, id: CloudView) => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault(); onNavigate(selected?.id, id)
  }
  return <div className={`pmc-app pm-ui${hasShell ? ' pmc-app--signed-in' : ''}${document ? ' pmc-app--document' : ''}`}>
    <header className="pm-ui-appbar pmc-appbar">
      <div className="pmc-brand"><span aria-hidden="true" dangerouslySetInnerHTML={MARK} /><strong>{t.brand}</strong><span className="pm-ui-appbar__context">{document && selected ? selected.name : t.title}</span></div>
      {headerActions}
    </header>
    <div className={`pmc-shell${hasShell ? ' pmc-shell--workspace' : ''}${document ? ' pmc-shell--document' : ''}`}>
      {hasShell && <aside className="pm-ui-sidebar pmc-sidebar" aria-label={t.spaces}>
        {switcher}
        {selected && <nav aria-label={t.navigation} className="pmc-sidebar-navigation">
          <p className="pm-ui-sidebar__label">{t.contentGroup}</p>
          {CLOUD_VIEWS.map((item, index) => <div key={item.id}>{index === 1 && <p className="pm-ui-sidebar__label">{t.manageGroup}</p>}<a className="pm-ui-sidebar__item" href={`/spaces/${encodeURIComponent(selected.id)}/${item.id}`} aria-current={view === item.id ? 'page' : undefined} onClick={event => link(event, item.id)}><PmIcon name={item.icon} /><span>{t[item.id]}</span></a></div>)}
        </nav>}
        {selected && <div className="pm-ui-sidebar__footer"><PmBadge>{t[selected.role]}</PmBadge>{selected.plan && <PmBadge>{selected.plan === 'free' ? t.free : selected.plan === 'pro' ? t.professional : selected.plan === 'team' ? t.team : selected.plan}</PmBadge>}</div>}
      </aside>}
      <main className="pmc-main">
        {hasShell && <div className="pmc-mobile-context">{switcher}{selected && navigation}</div>}
        {children}
      </main>
    </div>
  </div>
}
