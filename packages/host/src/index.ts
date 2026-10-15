export { componentErrors, PmBoundary } from './boundary.ts'
export type { ComponentError } from './boundary.ts'
export {
  installHost,
  useCursor,
  useHost,
  usePrefersReducedMotion,
  usePresentationMode,
  useSectionConfig,
  useService,
  useSharedState,
  useStartReport,
  useStaticRender,
  useStepState,
  useViewRole,
} from './host.ts'
export type { SharedStateOptions } from './host.ts'
export { pluginsOf, presmiumReport, presmiumService, registerPresmiumPlugin, startPresmium, stopPresmium, stopPresmiumOnPageHide } from './kernel.ts'
export type { StartOptions } from './kernel.ts'
export { currentLocale, useLocale, useMessages } from './locale.ts'
export type { Catalog } from './locale.ts'
export { createPresenterPanels, createToolbar } from './panels.ts'
export { default as PmPresenterPanels } from './PresenterPanels.vue'
export { PmStepScope, provideStepScope, useStepScope } from './scope.ts'
export type { StepScope } from './scope.ts'
export { createSharedStates } from './shared.ts'
export type { SharedStates } from './shared.ts'
export { default as PmToolbar } from './Toolbar.vue'
export { NAVIGATION, SYNC_TRANSPORTS, TOOLBAR } from './types.ts'
export { deckChannel, joinWindows } from './windows.ts'
export type { WindowChannel } from './windows.ts'
export type {
  HostAdapter,
  Navigation,
  NavigationPosition,
  SharedStateScope,
  SyncPublish,
  SyncTransport,
  SyncTransports,
  Toolbar,
  ToolbarItem,
  ViewRole,
} from './types.ts'
export { localeOf } from '@presmium/kernel/contracts'
export type { Locale } from '@presmium/kernel/contracts'
