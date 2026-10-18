/**
 * The client part of `@presmium/dsh` (docs/design-dsh.md 7): a client plugin of
 * DeepSeek Harness's web client (`dsh.client`), loaded by its module system from
 * the precompiled bundle (build/client.mjs). It
 * 1. takes the `root` slot in place of ui-layout (which the web patch turns off):
 *    the same six child slots, `ctx.layout` with ui-layout's contract, the
 *    `usePanelInfo` hook, the theme presenter and Mod+B (./Frame.tsx, ./layout.ts);
 *    with ui-layout on, it hangs the same panels in that layout instead (./fallback.tsx);
 * 2. maps DeepSeek Harness's tokens onto 书卷 and follows its light and dark (./theme.ts);
 * 3. puts Presmium's brand in its places (./brand.tsx);
 * 4. gives the workbench (`@presmium/workbench`) DeepSeek Harness's language.
 */
import { localeOf, Workbench } from '@presmium/workbench'
import type { Locale } from '@presmium/workbench'
import { brand } from './brand.tsx'
import { CLIENT_ID, ROOT_CHILDREN, UI_LAYOUT } from './contract.ts'
import { fallback } from './fallback.tsx'
import { frameFor } from './Frame.tsx'
import { createLayoutStore, LayoutController } from './layout.ts'
import { followScheme, ThemePresenter, TOKENS } from './theme.ts'

declare const __PRESMIUM_CSS__: string

/** The styles go in with the module (the module system takes a plugin's style tags back by their `data-plugin`). */
if (typeof document !== 'undefined' && !document.querySelector(`style[data-plugin-css="${CLIENT_ID}"]`)) {
  const style = document.createElement('style')
  style.dataset.plugin = CLIENT_ID
  style.dataset.pluginCss = CLIENT_ID
  style.textContent = __PRESMIUM_CSS__
  document.head.append(style)
}

export const inject = ['slots', 'theme', 'locale', 'shortcuts']

/** The workbench's language from DeepSeek Harness's: Chinese or English, else the browser's (7.6). */
function workbenchLocale(active: string | undefined): Locale {
  const tag = active?.toLowerCase() ?? ''
  if (tag.startsWith('zh') || tag.startsWith('en')) return localeOf(tag)
  return localeOf(navigator.language)
}

export function apply(ctx: DshClientContext): void {
  const workbench = new Workbench({ locale: workbenchLocale(ctx.locale.getLocale().active) })
  ctx.effect(() => () => workbench.dispose(), 'presmium: workbench')
  ctx.effect(() => ctx.locale.subscribe(() => workbench.setLocale(workbenchLocale(ctx.locale.getLocale().active))), 'presmium: language')
  ctx.effect(() => ctx.theme.overrideTokens(CLIENT_ID, TOKENS), 'presmium: 书卷 tokens')
  ctx.effect(() => {
    const follow = (snapshot: DshThemeSnapshot) => workbench.setDark(followScheme(snapshot))
    follow(ctx.theme.getTheme())
    return ctx.on('theme/change', follow)
  }, 'presmium: light and dark')

  const ownLayout = window.__DSH_BOOT__?.entries.some(entry => entry.id === UI_LAYOUT)
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
      const store = { ...handle, create: () => instance }
      const mainKeys = () => ctx.slots.entries('main').flatMap(entry => (entry.options.key === undefined ? [] : [entry.options.key]))
      const layout = new LayoutController(instance.actions, id => mainKeys().includes(id), {
        getSnapshot: () => instance.getSnapshot().panelInfo,
        subscribe: listener => instance.subscribe(listener),
      })
      /**
       * DeepSeek Harness's settings: their trigger is at the foot of its sidebar, which the frame keeps mounted when
       * it shows the file tree; the settings draw themselves over the page.
       */
      const openSettings = () => {
        const triggers = document.querySelectorAll<HTMLElement>('[data-pmw-slot="sidebar"] button[aria-haspopup="dialog"]')
        triggers[triggers.length - 1]?.click()
      }
      const disposePanelInfo = ctx.slots.provideRoot({ hooks: { panelInfo: layout.panelInfo } })
      const disposeService = ctx.reflect.provide('layout', layout)
      const disposeRoot = ctx.slots.register({ name: 'root', locale: 'common', children: { ...ROOT_CHILDREN }, store }, frameFor(workbench, openSettings))
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
