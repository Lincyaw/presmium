import { localeOf, Workbench } from '@presmium/workbench'
import type { Locale } from '@presmium/workbench'
import { brand } from './brand.tsx'
import { chrome } from './chrome.tsx'
import { CLIENT_ID, ROOT_CHILDREN, UI_LAYOUT } from './contract.ts'
import { FALLBACK_PANEL, fallback } from './fallback.tsx'
import { frameFor } from './Frame.tsx'
import { createLayoutStore, LayoutController } from './layout.ts'
import { sourceLinks } from './source.tsx'
import { followScheme, ThemePresenter, TOKENS } from './theme.ts'

declare const __PRESMIUM_CSS__: string

if (typeof document !== 'undefined' && !document.querySelector(`style[data-plugin-css="${CLIENT_ID}"]`)) {
  const style = document.createElement('style')
  style.dataset.plugin = CLIENT_ID
  style.dataset.pluginCss = CLIENT_ID
  style.textContent = __PRESMIUM_CSS__
  document.head.append(style)
}

export const inject = ['slots', 'theme', 'locale', 'shortcuts']

function workbenchLocale(active: string | undefined): Locale {
  const tag = active?.toLowerCase() ?? ''
  if (tag.startsWith('zh') || tag.startsWith('en')) return localeOf(tag)
  return localeOf(navigator.language)
}

export function apply(ctx: DshClientContext): void {
  const navigation = new Promise<DshClientContext['uiWorkspace']>(resolve => ctx.inject(['uiWorkspace'], inner => resolve(inner.uiWorkspace)))
  let workspaceSnapshot: ReturnType<DshClientContext['workspaces']['list']['getSnapshot']> = { items: [] }
  const workspaceListeners = new Set<() => void>()
  const workspaceStore = {
    getSnapshot: () => workspaceSnapshot,
    subscribe(listener: () => void) {
      workspaceListeners.add(listener)
      return () => { workspaceListeners.delete(listener) }
    },
  }
  // Register the root before the renderer boots; remote-backed workspace data follows later.
  ctx.inject(['workspaces'], inner => inner.effect(() => {
    const update = () => {
      workspaceSnapshot = inner.workspaces.list.getSnapshot()
      for (const listener of workspaceListeners) listener()
    }
    update()
    return inner.workspaces.list.subscribe(update)
  }, 'presmium: workspace list'))
  const workbench = new Workbench({ locale: workbenchLocale(ctx.locale.getLocale().active) })
  const ownLayout = window.__DSH_BOOT__?.entries.some(entry => entry.id === UI_LAYOUT)
  let showEditor = (layout: DshClientContext['layout']) => layout.selectPanel(FALLBACK_PANEL)
  sourceLinks(ctx, workbench, layout => showEditor(layout))
  ctx.effect(() => () => workbench.dispose(), 'presmium: workbench')
  ctx.inject(['sessions'], inner => inner.effect(() => {
    let previous: string | undefined
    let pending: AbortController | undefined
    const sync = () => {
      const session = Object.values(inner.sessions.list.getSnapshot().byId).find(row => (row.retainedBy.mainView ?? 0) > 0)
      if (!session) return
      const document = workbench.state.document === '' && workbench.state.documents?.single === false ? null : workbench.state.document ?? null
      const key = JSON.stringify([session.id, document])
      if (key === previous) return
      previous = key
      pending?.abort()
      pending = new AbortController()
      void fetch('/api/presmium/context', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session: session.id, document }), signal: pending.signal,
      }).catch(() => {})
    }
    const offSession = inner.sessions.list.subscribe(sync)
    const offDocument = workbench.subscribe(sync)
    sync()
    return () => { offSession(); offDocument(); pending?.abort() }
  }, 'presmium: selected document context (all layouts)'))
  ctx.effect(() => ctx.locale.subscribe(() => workbench.setLocale(workbenchLocale(ctx.locale.getLocale().active))), 'presmium: language')
  ctx.effect(() => ctx.theme.overrideTokens(CLIENT_ID, TOKENS), 'presmium: 书卷 tokens')
  ctx.effect(() => {
    const follow = (snapshot: DshThemeSnapshot) => workbench.setDark(followScheme(snapshot))
    follow(ctx.theme.getTheme())
    return ctx.on('theme/change', follow)
  }, 'presmium: light and dark')

  if (ownLayout) {
    fallback(ctx, workbench)
  } else {
    ctx.effect(() => {
      const presenter = new ThemePresenter()
      presenter.apply(ctx.theme.getTheme())
      const off = ctx.on('theme/change', (snapshot: DshThemeSnapshot) => presenter.apply(snapshot))
      return () => {
        off()
        presenter.dispose()
      }
    }, 'presmium: theme presenter')
    ctx.effect(() => {
      const handle = createLayoutStore()
      const instance = handle.create()
      const panelStore = chrome(ctx, workbench, instance.actions, instance.getSnapshot, async () => {
        const { root } = await workbench.client.workbench()
        const normalize = (path: string) => path.replace(/\\/g, '/').replace(/\/$/, '')
        const workspace = workspaceSnapshot.items.find(item => root && normalize(item.path) === normalize(root))
        if (workspace) (await navigation).startSession(workspace.workspaceId)
      })
      const store = { ...handle, create: () => instance }
      const mainKeys = () => ctx.slots.entries('main').flatMap(entry => (entry.options.key === undefined ? [] : [entry.options.key]))
      const layout = new LayoutController(instance.actions, id => mainKeys().includes(id), {
        getSnapshot: () => instance.getSnapshot().panelInfo,
        subscribe: listener => instance.subscribe(listener),
      })
      showEditor = () => layout.showDocument()
      const openSettings = () => {
        const triggers = document.querySelectorAll<HTMLElement>('[data-pmw-slot="sidebar"] button[aria-haspopup="dialog"]')
        triggers[triggers.length - 1]?.click()
      }
      const disposePanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo: layout.panelInfo } })
      const disposeService = ctx.reflect.provide('layout', layout)
      const nativeSidebar = window.__DSH_BOOT__?.entries.some(entry => entry.id === '@deepseek-ai/dsh-client-ui-sidebar')
      const disposeRoot = ctx.slots.register({ name: 'root', locale: 'common', children: {
        ...ROOT_CHILDREN,
        ...(nativeSidebar ? {} : { 'sidebar.panellist': { kind: 'list', scope: 'root' } as const }),
      }, store }, frameFor(workbench, openSettings, id => navigation.then(service => service.openWorkspace(id, () => layout.preserveNextConversation())), workspaceStore, panelStore))
      const binding = { code: 'KeyB', modifiers: ['primary', 'alt'] }
      const disposeShortcut = ctx.shortcuts.register({
        id: 'sidebar.left.toggle',
        label: () => (workbench.state.locale === 'zh-CN' ? '展开／收起侧栏' : 'Toggle the side panel'),
        aliases: ['sidebar', 'toggle left sidebar'],
        defaults: {
          'desktop:macos': { code: 'KeyB', modifiers: ['primary'] },
          'desktop:windows': { code: 'KeyB', modifiers: ['primary'] },
          'desktop:linux': { code: 'KeyB', modifiers: ['primary'] },
          'web:macos': binding,
          'web:windows': binding,
        },
        regions: ['page', 'editable'],
        modals: [],
        resolve: () => ({ status: 'handled', run: () => layout.toggleSidebar() }),
      })
      const retain = () => instance.actions.retainMainPanels(mainKeys())
      const disposePanels = ctx.slots.subscribe('main', retain)
      retain()
      return () => {
        disposeShortcut()
        layout.dispose()
        disposePanels()
        disposeRoot()
        disposePanelInfo()
        disposeService()
      }
    }, 'presmium: the root layout and ctx.layout')
  }
  brand(ctx, workbench)
}
