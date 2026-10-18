// The design system (N-10): fonts, tokens and the shared components' classes, for every page that uses the host.
import './design/design.css'

export { trackAgentTask } from './agent.ts'
export type { AgentTaskState } from './agent.ts'
export { blockAt, blockElement, blockKey, codeLines, lineNumbers, linesText, positionSlide, splitBlockKey } from './blocks.ts'
export type { BlockPoint } from './blocks.ts'
export { componentErrors, PmBoundary } from './boundary.ts'
export type { ComponentError } from './boundary.ts'
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
  provideToolbarPlace,
  useToolbarPlace,
} from './design/components.ts'
export type { ButtonVariant, Choice, MenuItem, PopoverPlacement, Tone } from './design/components.ts'
export { iconMarkup, ICONS } from './design/icons.ts'
export type { IconName } from './design/icons.ts'
export { useTheme } from './design/theme.ts'
export type { Theme } from './design/theme.ts'
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
export { pluginsOf, presmiumReport, presmiumService, registerPresmiumPlugin, reportPluginFailure, startHost, startPresmium, stopPresmium, stopPresmiumOnPageHide } from './kernel.ts'
export type { HostStart, StartOptions } from './kernel.ts'
export { currentLocale, useLocale, useMessages } from './locale.ts'
export type { Catalog } from './locale.ts'
export { PmApprovals } from './approvals.ts'
export { createOperations, createStatusRegistry } from './operations.ts'
export { createPresenterPanels, createToolbar } from './panels.ts'
export { createServerClient, provideServer, useServer } from './server.ts'
export { default as PmPresenterPanels } from './PresenterPanels.vue'
export { PmStepScope, provideStepScope, useStepScope } from './scope.ts'
export { claimFirst, useSessionSnapshot } from './session.ts'
export type { StepScope } from './scope.ts'
export { createSharedStates } from './shared.ts'
export type { SharedStates } from './shared.ts'
export { default as PmToolbar } from './Toolbar.vue'
export { EDIT_MODE, NAVIGATION, OPERATIONS, STATUS, SYNC_TRANSPORTS, TOOLBAR } from './types.ts'
export { deckChannel, joinWindows } from './windows.ts'
export type { WindowChannel } from './windows.ts'
export type {
  EditMode,
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
  ToolbarPlace,
  ToolbarSlot,
  ViewRole,
} from './types.ts'
export { localeOf } from '@presmium/kernel/contracts'
export type { Locale } from '@presmium/kernel/contracts'
