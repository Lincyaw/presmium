import type { Dispatch, SetStateAction } from 'react'
import type { Store } from './store.ts'
import { defineService } from '@lincyaw/kernel/contracts'
import type { Cursor, Member, Operation, PresentationMode, ServiceToken, StartReport, Unsubscribe } from '@lincyaw/kernel/contracts'
import type { IRDocument, ProductionPlaybackCommand, ProductionPlaybackState } from '@lincyaw/kernel'
import type { IconName } from '@lincyaw/design'

export type ViewRole = 'audience' | 'presenter' | 'reader'

export type SharedStateScope = 'view' | 'local' | 'remote'

export interface HostAdapter {
  readonly mode: PresentationMode
  readonly lang?: string
  useDoc?(): IRDocument
  useCursor(): Cursor
  useStep(): number
  useViewRole(): ViewRole
  useStaticRender(): boolean
  useSectionConfig(pluginId: string): Record<string, unknown>
  useSharedState<T>(key: string, initial: T, scope: SharedStateScope): [T, Dispatch<SetStateAction<T>>]
  sharedStateStore?<T>(key: string, initial: T, scope: SharedStateScope): Store<T>
  getService<T>(token: ServiceToken<T>): T | undefined
  startReport(): StartReport | undefined
  useDarkMode?(): [boolean, Dispatch<SetStateAction<boolean>>]
}

export type SyncPublish = (state: Readonly<Record<string, unknown>>, fromRemote: boolean) => void

export interface SyncTransport {
  connect(
    channel: string,
    receive: (patch: Record<string, unknown>) => void,
    state: Readonly<Record<string, unknown>>,
    persist: boolean,
  ): SyncPublish | undefined
}

export interface SyncTransports {
  add(transport: SyncTransport): Unsubscribe
}

export const SYNC_TRANSPORTS = defineService<SyncTransports>('presmium.syncTransports')

export interface NavigationPosition extends Cursor {
  /** Transient seek intent; authoring steps and Production retain no duplicate timing. */
  boundary?: 'start' | 'end'
  view?: string
  section?: string
}

export interface Navigation {
  readonly position: Store<NavigationPosition>
  go(position: NavigationPosition): void
}

export const NAVIGATION = defineService<Navigation>('presmium.navigation')

export type ToolbarSlot = 'tools' | 'settings' | 'status'

export type ToolbarPlacement = 'bar' | 'status'

export interface ToolbarItem {
  id: string
  title: string
  component: unknown
  order?: number
  slot?: ToolbarSlot
  icon?: IconName
}

export interface Toolbar {
  register(item: ToolbarItem): Unsubscribe
  list(): ToolbarItem[]
  subscribe(listener: () => void): Unsubscribe
}

export const TOOLBAR = defineService<Toolbar>('presmium.toolbar')

export interface ServerClient {
  readonly available: boolean
  readonly member: Store<Member | undefined>
  fetch(plugin: string, path: string, init?: RequestInit): Promise<Response>
  events(plugin: string, path: string): EventSource
}

export interface StatusProvider {
  id: string
  read(): unknown
}

export interface StatusRegistry {
  register(provider: StatusProvider): Unsubscribe
  list(): StatusProvider[]
}

export const STATUS = defineService<StatusRegistry>('presmium.status')

export interface ReplayHandler {
  apply(data: Record<string, unknown>, seeking: boolean): void
  clear?(): void
}

export interface Operations {
  report(operation: Operation): void
  subscribe(listener: (operation: Operation) => void): Unsubscribe
  onReplay(type: string, handler: ReplayHandler): Unsubscribe
  replay(operation: Operation, seeking?: boolean): boolean
  clear(): void
  readonly replaying: Store<boolean>
}

export const OPERATIONS = defineService<Operations>('presmium.operations')

/** A registered player keeps its existing clock; this lease only coordinates whether it may start. */
export interface PlaybackLease {
  requestStart(): Promise<boolean>
  cancel(): void
  dispose(): void
}

export interface PlaybackControl {
  register(pause: () => void): PlaybackLease
  pause(): void
  /** Embedded previews await their author's audio focus before starting. Ordinary pages need no gate. */
  setGate(authorize: (signal: AbortSignal) => Promise<void>): Unsubscribe
}

export const PLAYBACK_CONTROL = defineService<PlaybackControl>('presmium.playbackControl')

/** Observes the loaded player's clock and selects stable step boundaries; author interfaces never synthesize time. */
export interface ProductionPlayback {
  readonly version: 1
  readonly state: Pick<Store<ProductionPlaybackState | undefined>, 'getSnapshot' | 'subscribe'>
  control(command: ProductionPlaybackCommand, signal?: AbortSignal): Promise<ProductionPlaybackState>
}
export const PRODUCTION_PLAYBACK = defineService<ProductionPlayback>('presmium.productionPlayback')

/** A loaded timed-caption player owns presentation captions until its lease is released. */
export interface TimedCaptions {
  readonly active: Store<boolean>
  claim(): Unsubscribe
}
export const TIMED_CAPTIONS = defineService<TimedCaptions>('presmium.timedCaptions')

export interface StepClockDriver {
  readonly elapsed: Store<number | undefined>
  readonly recording?: boolean
}

export interface StepClock {
  drive(driver: StepClockDriver): Unsubscribe
  wait(work: Promise<unknown>): void
  settled(): Promise<void>
}

export const STEP_CLOCK = defineService<StepClock>('presmium.stepClock')
