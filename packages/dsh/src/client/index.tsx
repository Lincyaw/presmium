import { connectAuthoringClient, localeOf, Workbench, workspaceClient } from '@lincyaw/workbench'
import type { Locale } from '@lincyaw/workbench'
import { workspaceSubscriptions } from './workspace-events.ts'
import { registerBrand } from './brand.tsx'
import { CLIENT_ID, isBootEntryLoaded, ROOT_CHILDREN, UI_LAYOUT, UI_SIDEBAR } from './contract.ts'
import { syncDocumentContext } from './document-context.ts'
import { FALLBACK_PANEL, registerFallbackLayout } from './fallback.tsx'
import { createLayoutStore, LayoutController } from './layout.ts'
import { CLIENT_MESSAGES } from './messages.ts'
import { registerNavigationShell } from './navigation-shell.tsx'
import { createObservable } from './observable.ts'
import { isSamePath } from './paths.ts'
import { registerAgentRequests } from './agent-requests.ts'
import { rootLayoutFor } from './RootLayout.tsx'
import { beginRootReload, restoreRootReturnPoint, retainOpenDocument, saveRootReturnPoint } from './root-reload.ts'
import { registerSourceLinks } from './source-links.tsx'
import { runtimeDiagnostics } from './runtime-diagnostics.tsx'
import { DSH_THEME_TOKENS, syncDarkClass, ThemePresenter } from './theme.ts'

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
  const nativeLayout = isBootEntryLoaded(UI_LAYOUT)
  const reload = nativeLayout ? { reloading: false } : beginRootReload()
  if (reload.reloading) return
  const uiWorkspace = new Promise<DshClientContext['uiWorkspace']>(resolve => ctx.inject(['uiWorkspace'], inner => resolve(inner.uiWorkspace)))
  const dshWorkspaces = createObservable<ReturnType<DshClientContext['workspaces']['list']['getSnapshot']>>({ items: [] })
  // Register the root before the renderer boots; remote-backed workspace data follows later.
  ctx.inject(['workspaces'], inner => inner.effect(() => {
    const update = () => dshWorkspaces.set(inner.workspaces.list.getSnapshot())
    update()
    return inner.workspaces.list.subscribe(update)
  }, 'presmium: workspace list'))
  const workbench = new Workbench({ client: workspaceClient('api/presmium/', workspaceSubscriptions(ctx)), locale: workbenchLocale(ctx.locale.getLocale().active) })
  ctx.effect(() => connectAuthoringClient(workbench), 'presmium: authoring client control')
  ctx.effect(() => runtimeDiagnostics(workbench).start(), 'presmium: runtime diagnostics')
  let showEditor = (layout: DshClientContext['layout']) => layout.selectPanel(FALLBACK_PANEL)
  registerSourceLinks(ctx, workbench, layout => showEditor(layout))
  ctx.effect(() => () => {
    workbench.dispose()
    if (!nativeLayout) saveRootReturnPoint(workbench)
  }, 'presmium: workbench')
  syncDocumentContext(ctx, workbench)
  registerAgentRequests(ctx, workbench)
  ctx.effect(() => ctx.locale.subscribe(() => workbench.setLocale(workbenchLocale(ctx.locale.getLocale().active))), 'presmium: language')
  ctx.effect(() => ctx.theme.overrideTokens(CLIENT_ID, DSH_THEME_TOKENS), 'presmium: 书卷 tokens')
  ctx.effect(() => {
    const sync = (snapshot: DshThemeSnapshot) => workbench.setDark(syncDarkClass(snapshot))
    sync(ctx.theme.getTheme())
    return ctx.on('theme/change', sync)
  }, 'presmium: light and dark')

  if (nativeLayout) {
    registerFallbackLayout(ctx, workbench)
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
      const globalPanels = createObservable<readonly DshSlotEntry[]>([])
      registerNavigationShell(ctx, workbench, instance, globalPanels, async () => {
        const { root } = await workbench.client.readWorkbenchInfo()
        const workspace = dshWorkspaces.getSnapshot().items.find(item => root && isSamePath(item.path, root))
        if (workspace) (await uiWorkspace).startSession(workspace.workspaceId)
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
      const disposeRoot = ctx.slots.register({ name: 'root', locale: 'common', children: {
        ...ROOT_CHILDREN,
        ...(isBootEntryLoaded(UI_SIDEBAR) ? {} : { 'sidebar.panellist': { kind: 'list', scope: 'root' } as const }),
      }, store }, rootLayoutFor({
        workbench,
        openSettings,
        openDshWorkspace: id => uiWorkspace.then(service => service.openWorkspace(id, () => layout.preserveNextConversation())),
        dshWorkspaces,
        globalPanels,
      }))
      const disposeService = ctx.reflect.provide('layout', layout)
      const binding = { code: 'KeyB', modifiers: ['primary', 'alt'] }
      const disposeShortcut = ctx.shortcuts.register({
        id: 'sidebar.left.toggle',
        label: () => CLIENT_MESSAGES[workbench.state.locale].toggleSide,
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
        disposeService()
        disposeRoot()
        disposePanelInfo()
      }
    }, 'presmium: the root layout and ctx.layout')
  }
  registerBrand(ctx, workbench)
  if (!nativeLayout) {
    ctx.effect(() => restoreRootReturnPoint(workbench, reload.point), 'presmium: restore root return point')
    ctx.effect(() => retainOpenDocument(workbench), 'presmium: retain the open document')
  }
}
