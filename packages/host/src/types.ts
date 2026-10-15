/**
 * Form-neutral host contract. Plugin components depend on this package only,
 * never on @slidev/client or vitepress, so they run in both forms.
 * Implemented by @presmium/slidev-addon-core (slides) and @presmium/web (document).
 */
import type { Ref } from 'vue'
import { defineService } from '@presmium/kernel/contracts'
import type { Cursor, PresentationMode, ServiceToken, StartReport, Unsubscribe } from '@presmium/kernel/contracts'

export type ViewRole = 'audience' | 'presenter' | 'reader'

export interface HostAdapter {
  readonly mode: PresentationMode
  /** Must be called inside a component setup. */
  useCursor(): Readonly<Ref<Cursor>>
  /**
   * The current step of the slide or section that renders the calling
   * component; `Infinity` where every step is shown (the document view).
   * Must be called inside a component setup.
   */
  useStep(): Readonly<Ref<number>>
  /** Must be called inside a component setup. */
  useViewRole(): Readonly<Ref<ViewRole>>
  getService<T>(token: ServiceToken<T>): T | undefined
  /** Kernel start report, available after the kernel has started. */
  startReport(): StartReport | undefined
}

// ---------------------------------------------------------------------------
// Sync transport port (K-06): how a network transport joins the host's
// synchronized state. The slides host maps it onto Slidev's `addSyncMethod`.
// ---------------------------------------------------------------------------

/** Publishes local state; `fromRemote` is true when the change itself came from a transport. */
export type SyncPublish = (state: Readonly<Record<string, unknown>>, fromRemote: boolean) => void

export interface SyncTransport {
  /**
   * Called once for each synchronized state channel (navigation, drawings, ...).
   * Pass remote patches to `receive`; return a publisher for local changes, or
   * undefined to leave the channel alone. `persist` marks channels that survive reloads.
   */
  connect(
    channel: string,
    receive: (patch: Record<string, unknown>) => void,
    state: Readonly<Record<string, unknown>>,
    persist: boolean,
  ): SyncPublish | undefined
}

export interface SyncTransports {
  /** Connects the transport to every current and future channel; the returned function detaches it. */
  add(transport: SyncTransport): Unsubscribe
}

/** Host service of the slides form; absent in the document form. */
export const SYNC_TRANSPORTS = defineService<SyncTransports>('presmium.syncTransports')

// ---------------------------------------------------------------------------
// Navigation: where this window is, and moving it, outside any component.
// ---------------------------------------------------------------------------

/** A place in the deck, the same in both forms (one slide per section). */
export interface NavigationPosition extends Cursor {
  /** Runtime view showing it (the web form: 'document', 'scrolly', 'present', ...); absent in the slides form. */
  view?: string
}

export interface Navigation {
  /** This window's position. */
  readonly position: Readonly<Ref<NavigationPosition>>
  /**
   * Moves this window to a position. The web form also switches to `view`
   * unless the view is unknown or hidden (the presenter window); the slides
   * form has no views.
   */
  go(position: NavigationPosition): void
}

/** Host service of both forms, e.g. for a classroom whose learners follow the presenter. */
export const NAVIGATION = defineService<Navigation>('presmium.navigation')

// ---------------------------------------------------------------------------
// Toolbar: controls plugins add to the host's toolbar.
// ---------------------------------------------------------------------------

export interface ToolbarItem {
  id: string
  title: string
  /** A Vue component, rendered inline in the toolbar. */
  component: unknown
  order?: number
}

export interface Toolbar {
  register(item: ToolbarItem): Unsubscribe
  list(): ToolbarItem[]
  subscribe(listener: () => void): Unsubscribe
}

/**
 * Host service of both forms (`PmToolbar` shows it): the navigation bar of
 * the web form, the navigation controls of the slides form.
 */
export const TOOLBAR = defineService<Toolbar>('presmium.toolbar')
