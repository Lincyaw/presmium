import type { Ref } from 'vue'
import { defineService } from '@presmium/kernel/contracts'
import type { Cursor, Member, Operation, PresentationMode, ServiceToken, StartReport, Unsubscribe } from '@presmium/kernel/contracts'
import type { IconName } from '@presmium/design'

export type ViewRole = 'audience' | 'presenter' | 'reader'

export type SharedStateScope = 'view' | 'local' | 'remote'

export interface HostAdapter {
  readonly mode: PresentationMode
  readonly lang?: string
  useCursor(): Readonly<Ref<Cursor>>
  useStep(): Readonly<Ref<number>>
  useViewRole(): Readonly<Ref<ViewRole>>
  useStaticRender(): Readonly<Ref<boolean>>
  useSectionConfig(pluginId: string): Readonly<Ref<Record<string, unknown>>>
  useSharedState<T>(key: string, initial: T, scope: SharedStateScope): Ref<T>
  getService<T>(token: ServiceToken<T>): T | undefined
  startReport(): StartReport | undefined
  useDarkMode?(): Ref<boolean>
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
  view?: string
  section?: string
}

export interface Navigation {
  readonly position: Readonly<Ref<NavigationPosition>>
  go(position: NavigationPosition): void
}

export const NAVIGATION = defineService<Navigation>('presmium.navigation')

export type ToolbarSlot = 'tools' | 'settings' | 'status' | 'home' | 'create' | 'files' | 'tabs' | 'source' | 'dock'

/** @experimental */
export type ToolbarPlace = 'bar' | 'activity' | 'status' | 'home' | 'pane'

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
  readonly member: Readonly<Ref<Member | undefined>>
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

/** @experimental */
export interface EditMode {
  readonly active: Readonly<Ref<boolean>>
  readonly allowed: Readonly<Ref<boolean>>
  enter(): void
  leave(): void
}

/** @experimental */
export const EDIT_MODE = defineService<EditMode>('presmium.editMode')

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
  readonly replaying: Ref<boolean>
}

export const OPERATIONS = defineService<Operations>('presmium.operations')
