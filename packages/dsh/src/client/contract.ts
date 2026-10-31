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

/**
 * Where the AI assistant explains a missing model and a failed turn: the composer's takeover chain, and the chat's
 * `turn-error` node (its shipped cell is replaced, so every failed turn reads in the author's terms).
 */
export const ASSISTANT_SLOTS = ['conversation.composer', { name: 'conversation.chat.node', key: 'turn-error' }] as const

/** Where the kitten sits beside the conversation: an added entry (its own id) among the session header's actions. */
export const MASCOT_SLOT = { name: 'conversation.session.header.actions', id: 'presmium-mascot' } as const

/** Where the author turns the kitten on or off: an added row (its own id) in Settings → General. */
export const MASCOT_SETTING = { name: 'settings.general.item', id: 'presmium-mascot' } as const

/**
 * Settings → Models, and when the model catalog is read again: on the Host's events that change what can be routed,
 * whenever the window regains focus, and on a slow poll while no model is usable (Settings is a modal over this page,
 * so saving a key there does not refocus the window).
 */
export const MODEL_SETTINGS = {
  section: 'models',
  events: ['credentials/reference-updated', 'settings/document-updated', 'llm/adapters-updated'],
  pollMs: 3000,
} as const

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

/**
 * Harness's technical rows in Settings → General, by cell id, that stay out of an author's Settings while the coding
 * view is off: the default permission mode and the display of the AI's work (work details and when they collapse, send
 * behaviour while busy, performance and usage).
 */
export const TECHNICAL_SETTINGS = { slot: 'settings.general.item', ids: ['permission', 'transcript-view', 'composer-enter', 'performance-usage'] } as const

/**
 * The author's defaults for Harness's display preferences, by settings namespace (docs/studio.md 7.2):
 * the coding view (trajectory, code diffs, every agent preset and the technical rows above) off, and the AI's work as
 * compact, collapsed summaries without token statistics.
 */
export const AUTHOR_DEFAULTS: Record<string, Record<string, unknown>> = {
  'ui-settings': { enabled: false },
  'ui-chat': { transcriptView: 'compact', performanceUsage: 'compact' },
}

export const EXPERIMENTAL_GROUP = '[data-plugin-group="extensions"]'

export const UI_LAYOUT = '@deepseek-ai/dsh-client-ui-layout'
export const UI_SIDEBAR = '@deepseek-ai/dsh-client-ui-sidebar'

/** Whether DeepSeek Harness's boot graph has the plugin `id` (a running host keeps its roster until it restarts). */
export function isBootEntryLoaded(id: string): boolean {
  return window.__DSH_BOOT__?.entries.some(entry => entry.id === id) ?? false
}
