/// <reference path="./styles.d.ts" />
import './design/design.css'

export { useActions } from './actions.ts'
export type { ActionOptions, ComponentAction } from './actions.ts'
export { blockAt, blockElement, blockKey, codeLines, lineNumbers, linesText, splitBlockKey } from './blocks.ts'
export type { BlockPoint } from './blocks.ts'
export { componentErrors, componentErrorRevision, PmBoundary } from './error-boundary.ts'
export type { ComponentError } from './error-boundary.ts'
export {
  PmBadge,
  PmButton,
  PmCard,
  PmDialog,
  PmDrawer,
  PmEmpty,
  PmSkeleton,
  PmField,
  PmIcon,
  PmIconButton,
  PmMenu,
  PmNotice,
  PmPopover,
  PmSegmented,
  PmTabs,
  PmTabPanel,
  PmTooltip,
  PmToolbarEntry,
  provideToolbarPlacement,
  useToolbarPlacement,
} from './design/components.ts'
export type { ButtonVariant, Choice, ControlDensity, MenuItem, PopoverPlacement, Tone } from './design/components.ts'
export { PmColumns, PmStack, PmTabGroup } from './design/layout.ts'
export { PmCaption, PmCaptionProvider } from './design/caption.ts'
export type { CaptionProps } from './design/caption.ts'
export type { ContentLayoutProps, ColumnsLayoutProps, TabLayoutEntry } from './design/layout.ts'
export { iconMarkup, ICONS } from '@lincyaw/design'
export type { IconName } from '@lincyaw/design'
export { useAppearance } from './design/appearance.ts'
export type { Appearance } from './design/appearance.ts'
export {
  installHost,
  HostProvider,
  useStep,
  useDoc,
  useCursor,
  useHost,
  usePrefersReducedMotion,
  usePresentationMode,
  useSectionConfig,
  useService,
  useSharedState,
  getSharedStateStore,
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
export { createServerClient, provideServer, useServer, serverClient } from './server.ts'
export { PmPresenterPanels } from './panels.ts'
export { useStepTime } from './step-clock.ts'
export type { StepTimeOptions } from './step-clock.ts'
export { StepScope, useBlockStepRange, useStepScope } from './step-scope.ts'
export { useSessionSnapshot } from './session.ts'
export type { StepScope as StepScopeValue } from './step-scope.ts'
export { createSharedStates } from './shared-state.ts'
export type { SharedStates } from './shared-state.ts'
export { PmToolbar } from './panels.ts'
export { NAVIGATION, OPERATIONS, PLAYBACK_CONTROL, PRODUCTION_PLAYBACK, STATUS, STEP_CLOCK, SYNC_TRANSPORTS, TIMED_CAPTIONS, TOOLBAR } from './contracts.ts'
export type { TimedCaptions } from './contracts.ts'
export { joinWindows } from './windows.ts'
export { setSiteBase, siteBase } from './site.ts'
export type { WindowChannel } from './windows.ts'
export type {
  HostAdapter,
  Navigation,
  NavigationPosition,
  Operations,
  PlaybackControl,
  PlaybackLease,
  ProductionPlayback,
  ReplayHandler,
  ServerClient,
  SharedStateScope,
  StatusProvider,
  StatusRegistry,
  StepClock,
  StepClockDriver,
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

export { createStore, useStore, observe } from './store.ts'
export type { Store } from './store.ts'

export { runtimeRevision } from "./runtime.ts"
