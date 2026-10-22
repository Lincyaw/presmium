// What the client part assumes of DeepSeek Harness's client: the IDs it registers and looks for, the children of the
// root slot, the members of ctx.layout, the brand and first-use slots, the shell's module table and the plugin group
// of the plugins page. The build (build/client.mjs) and the upgrade gate (e2e/workbench.spec.ts) read these too.
export const CLIENT_ID = '@lincyaw/dsh'

export const ROOT_CHILDREN = {
  'sidebar': { kind: 'single', scope: 'root' },
  'main': { kind: 'keyed', scope: 'root' },
  'rightbar': { kind: 'single', scope: 'root' },
  'shell.bottom': { kind: 'single', scope: 'root' },
  'shell.overlay': { kind: 'list', scope: 'root' },
  'shell.leading': { kind: 'single', scope: 'root' },
} as const

export const LAYOUT_MEMBERS = ['panelInfo', 'selectPanel', 'beginNavigation', 'toggleSidebar', 'openRightbar', 'closeRightbar'] as const

export const BRAND_SLOTS = ['sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark'] as const
export const ONBOARDING = { slot: 'settings.onboarding', steps: ['welcome-notice', 'deepseek-official'] } as const

export const SHELL_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  'zod',
  '@tanstack/react-virtual',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
] as const

export const EXPERIMENTAL_GROUP = '[data-plugin-group="extensions"]'

export const UI_LAYOUT = '@deepseek-ai/dsh-client-ui-layout'
export const UI_SIDEBAR = '@deepseek-ai/dsh-client-ui-sidebar'

/** Whether DeepSeek Harness's boot graph has the plugin `id` (a running host keeps its roster until it restarts). */
export function isBootEntryLoaded(id: string): boolean {
  return window.__DSH_BOOT__?.entries.some(entry => entry.id === id) ?? false
}
