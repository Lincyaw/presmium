/**
 * What the workbench's client part relies on of DeepSeek Harness's client
 * runtime (docs/design-dsh.md 2.4, seam S2, and 7.2): the child slots of `root`,
 * the members of `ctx.layout` its plugins call, the brand and first-use slots,
 * the shell's module table and the DOM attribute of the Plugins page's
 * experimental group. Only README-described or read from the pinned version's
 * bundles; the upgrade gate's third group (the start audit, e2e/workbench.spec.ts)
 * checks each against the installed DeepSeek Harness.
 */

/** The client bundle's module id: the package's name (a plugin bundle is its package's client half). */
export const CLIENT_ID = '@presmium/dsh'

/** The child slots `root` declares, as `dsh-client-ui-layout` does: DeepSeek Harness's own plugins sit in them unchanged. */
export const ROOT_CHILDREN = {
  'sidebar': { kind: 'single', scope: 'root' },
  'main': { kind: 'keyed', scope: 'root' },
  'rightbar': { kind: 'single', scope: 'root' },
  'shell.bottom': { kind: 'single', scope: 'root' },
  'shell.overlay': { kind: 'list', scope: 'root' },
  'shell.leading': { kind: 'single', scope: 'root' },
} as const

/** The members of `ctx.layout` (`ILayout` of ui-layout) the root layout provides. */
export const LAYOUT_MEMBERS = ['panelInfo', 'selectPanel', 'beginNavigation', 'toggleSidebar', 'openRightbar', 'closeRightbar'] as const

/** The slots Presmium's brand takes (7.4), and the first-use step it replaces. */
export const BRAND_SLOTS = ['sidebar.brand.mark', 'sidebar.brand.name', 'conversation.hero.brand.mark'] as const
export const ONBOARDING = { slot: 'settings.onboarding', steps: ['welcome-notice', 'deepseek-official'] } as const

/** The keys of the shell's module table (7.8): the client bundle's externals. */
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

/** The Plugins page's group of experimental bundles (and the plugin market among them), which the workbench hides (7.5). */
export const EXPERIMENTAL_GROUP = '[data-plugin-group="extensions"]'

/** The client row of DeepSeek Harness's own layout: present in the boot graph, the workbench falls back to it (7.2). */
export const UI_LAYOUT = '@deepseek-ai/dsh-client-ui-layout'

/** The languages whose copy Presmium replaces where it carries DeepSeek's brand (7.5): full tags over the built-in primary ones. */
export const BRAND_LANGUAGES = [{ id: 'zh-CN', label: '简体中文（Presmium）', fallback: 'zh' }, { id: 'en-US', label: 'English (Presmium)', fallback: 'en' }] as const
