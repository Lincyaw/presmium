import './design/design.css'

export { blockAt, blockElement, blockKey, codeLines, lineNumbers, linesText, splitBlockKey } from './blocks.ts'
export type { BlockPoint } from './blocks.ts'
export { componentErrors, PmBoundary } from './error-boundary.ts'
export type { ComponentError } from './error-boundary.ts'
export {
  PmBadge,
  PmButton,
  PmCard,
  PmDialog,
  PmDrawer,
  PmEmpty,
  PmField,
  PmIcon,
  PmIconButton,
  PmMenu,
  PmNotice,
  PmPopover,
  PmSegmented,
  PmTabs,
  PmToolbarEntry,
  provideToolbarPlacement,
  useToolbarPlacement,
} from './design/components.ts'
export type { ButtonVariant, Choice, MenuItem, PopoverPlacement, Tone } from './design/components.ts'
export { iconMarkup, ICONS } from '@lincyaw/design'
export type { IconName } from '@lincyaw/design'
export { useAppearance } from './design/appearance.ts'
export type { Appearance } from './design/appearance.ts'
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
export { pluginsOf, presmiumReport, presmiumService, registerPresmiumPlugin, reportPluginFailure, setHostActive, startHost, stopHost } from './runtime.ts'
export type { HostStart } from './runtime.ts'
export { currentLocale, useLocale, useMessages } from './locale.ts'
export type { Catalog } from './locale.ts'
export { PmApprovals } from './approvals.ts'
export { claimFirst } from './claim-first.ts'
export { createServerClient, provideServer, useServer } from './server.ts'
export { default as PmPresenterPanels } from './PresenterPanels.vue'
export { PmStepScope, provideStepScope, useBlockStepRange, useStepScope } from './step-scope.ts'
export { useSessionSnapshot } from './session.ts'
export type { StepScope } from './step-scope.ts'
export { createSharedStates } from './shared-state.ts'
export type { SharedStates } from './shared-state.ts'
export { default as PmToolbar } from './Toolbar.vue'
export { NAVIGATION, OPERATIONS, STATUS, SYNC_TRANSPORTS, TOOLBAR } from './contracts.ts'
export { joinWindows } from './windows.ts'
export type { WindowChannel } from './windows.ts'
export type {
  HostAdapter,
  Navigation,
  NavigationPosition,
  Operations,
  ReplayHandler,
  ServerClient,
  SharedStateScope,
  StatusProvider,
  StatusRegistry,
  SyncPublish,
  SyncTransport,
  SyncTransports,
  Toolbar,
  ToolbarItem,
  ToolbarPlacement,
  ToolbarSlot,
  ViewRole,
} from './contracts.ts'
export { localeOf } from '@lincyaw/kernel'
export type { Locale } from '@lincyaw/kernel/contracts'
export { codeLinesBox } from './code-lines-box.ts'
export { createResidentWorker } from './resident-worker.ts'
export type { ResidentWorker, ResidentWorkerFailure, ResidentWorkerOptions, ResidentWorkerOutcome } from './resident-worker.ts'
