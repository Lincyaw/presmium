/**
 * Form-neutral host contract. Plugin components depend on this package only,
 * never on @slidev/client or vitepress, so they run in both forms.
 * Implemented by @presmium/slidev-addon-core (slides) and @presmium/web (document).
 */
import type { Ref } from 'vue'
import { defineService } from '@presmium/kernel/contracts'
import type { Cursor, Member, Operation, PresentationMode, ServiceToken, StartReport, Unsubscribe } from '@presmium/kernel/contracts'
import type { IconName } from './design/icons.ts'

export type ViewRole = 'audience' | 'presenter' | 'reader'

/**
 * Who shares a state (`useSharedState`): this window only; every window of
 * the deck in this browser (e.g. the presenter and the audience window); or
 * also other devices, through the sync transports (e.g. a classroom).
 */
export type SharedStateScope = 'view' | 'local' | 'remote'

export interface HostAdapter {
  readonly mode: PresentationMode
  /**
   * Language tag of the deck (e.g. `en-US`), for renders without a document
   * (a server render); in the browser `<html lang>` carries it.
   */
  readonly lang?: string
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
  /**
   * True while the form renders a static copy (the slides form printing a PDF
   * or PNG export): components then show their IR `fallback`. Must be called
   * inside a component setup.
   */
  useStaticRender(): Readonly<Ref<boolean>>
  /**
   * The configuration of plugin `pluginId` for the slide or section of the
   * calling component (the current one outside a section): the global
   * `presmium.<plugin id>` with the section's `{config}` over it. Must be
   * called inside a component setup.
   */
  useSectionConfig(pluginId: string): Readonly<Ref<Record<string, unknown>>>
  /**
   * A state shared by `key` (prefix it with the plugin id) within `scope`;
   * every caller with the same key and scope gets the same state. Values must
   * be JSON data. Callable outside components.
   */
  useSharedState<T>(key: string, initial: T, scope: SharedStateScope): Ref<T>
  getService<T>(token: ServiceToken<T>): T | undefined
  /** Kernel start report, available after the kernel has started. */
  startReport(): StartReport | undefined
  /**
   * The host's own switch of the dark colour scheme (`useTheme`), e.g. the
   * web form's appearance switch, so a change is remembered as the host's
   * own. Without it `useTheme` sets the class `dark` of `<html>`. Must be
   * called inside a component setup.
   */
  useDarkMode?(): Ref<boolean>
}

// ---------------------------------------------------------------------------
// Sync transport port (K-06): how a network transport joins the host's
// synchronized state. Both hosts connect it to the 'remote' shared states;
// the slides host also maps it onto Slidev's `addSyncMethod` (navigation,
// drawings).
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

/** Host service of both forms (see above). */
export const SYNC_TRANSPORTS = defineService<SyncTransports>('presmium.syncTransports')

// ---------------------------------------------------------------------------
// Navigation: where this window is, and moving it, outside any component.
// ---------------------------------------------------------------------------

/** A place in the deck, the same in both forms (one slide per section). */
export interface NavigationPosition extends Cursor {
  /** Runtime view showing it (the web form: 'document', 'scrolly', 'present', ...); absent in the slides form. */
  view?: string
  /**
   * The section's id (D-4): the same in the full and the student build,
   * which number their sections apart. A form reports it with its position;
   * `go` goes to it where the deck has it, else to the last step of `back`
   * (FollowAnchor), staying put when neither; never by slide number.
   */
  section?: string
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

/**
 * Where an item belongs in a host's shell (docs/architecture.md 5.10). A
 * page's toolbar (the web form's navigation bar, the slides' navigation
 * controls) shows `tools` and `settings`; the workspace's home page shows
 * `tools` with an icon in its activity bar and the others in its top bar,
 * `settings` at the foot of the activity bar, `status` in its status bar,
 * `home` as cards below the documents, `create` beside the document cards
 * and `files` in its side bar (the file tree). Edit mode shows `tools` and
 * `settings` at the end of its top bar, `tabs` in it after the document's
 * name (the open files), `status` in its status bar, `source` in the left
 * pane of its split (the source editor) and `dock` in its right dock; the
 * home page shows `tabs` and `source` in place of the launcher while its
 * editor is open (the workspace's `EDIT_MODE`).
 */
export type ToolbarSlot = 'tools' | 'settings' | 'status' | 'home' | 'create' | 'files' | 'tabs' | 'source' | 'dock'

/**
 * Where an item's component is drawn now (`useToolbarPlace`): a page's
 * toolbar, the activity bar, a status bar, the home page, a pane of edit mode.
 */
export type ToolbarPlace = 'bar' | 'activity' | 'status' | 'home' | 'pane'

export interface ToolbarItem {
  id: string
  title: string
  /** A Vue component, rendered inline in the toolbar (or the place of its `slot`). */
  component: unknown
  order?: number
  /** Default `tools`. */
  slot?: ToolbarSlot
  /** A line icon of the host (`PmIcon`): with one, the home page shows a `tools` item in its activity bar. */
  icon?: IconName
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

// ---------------------------------------------------------------------------
// Server (docs/architecture.md 4.7): the page's access to `presmium dev` and
// `presmium serve`, and what the page reports to them.
// ---------------------------------------------------------------------------

export interface ServerClient {
  /** True when `presmium dev` or `presmium serve` serves the page; false in static output and server renders. */
  readonly available: boolean
  /** The current member; set after the handshake. */
  readonly member: Readonly<Ref<Member | undefined>>
  /** Calls a plugin's route `/__presmium/<plugin>/<path>`, with the document directory (`Presmium-Document`) and the UI language (`Accept-Language`). */
  fetch(plugin: string, path: string, init?: RequestInit): Promise<Response>
  /** Subscribes to a plugin's SSE route. */
  events(plugin: string, path: string): EventSource
}

export interface StatusProvider {
  /** The plugin id. */
  id: string
  /** JSON data, without learners' identities. */
  read(): unknown
}

export interface StatusRegistry {
  register(provider: StatusProvider): Unsubscribe
  list(): StatusProvider[]
}

/** Host service of both forms: the plugins' status summaries, sent to the server over the control channel. */
export const STATUS = defineService<StatusRegistry>('presmium.status')

export interface EditMode {
  readonly active: Readonly<Ref<boolean>>
  /** The current member may enter edit mode (editors and owners). */
  readonly allowed: Readonly<Ref<boolean>>
  enter(): void
  leave(): void
}

/** Provided by the workspace's browser plugin; absent in `presmium dev` and in static output. */
export const EDIT_MODE = defineService<EditMode>('presmium.editMode')

// ---------------------------------------------------------------------------
// Operations (docs/architecture.md 4.9): what viewers do, reported and replayed.
// ---------------------------------------------------------------------------

export interface ReplayHandler {
  /** Applies one operation; `seeking` is true while fast-forwarding to a time, with no animation. */
  apply(data: Record<string, unknown>, seeking: boolean): void
  /** Returns to the state without operations of this type; called before seeking. */
  clear?(): void
}

export interface Operations {
  /** Plugins report what the user did; dropped while `replaying` is true. */
  report(operation: Operation): void
  /** Gets every reported operation (a recorder). */
  subscribe(listener: (operation: Operation) => void): Unsubscribe
  /** Registers the replay of one type of operation. */
  onReplay(type: string, handler: ReplayHandler): Unsubscribe
  /** Replays an operation; false when no plugin replays its type, which a player ignores. */
  replay(operation: Operation, seeking?: boolean): boolean
  /** Calls every replay's `clear`. */
  clear(): void
  /** True while a player applies operations, back to false once the page has settled. */
  readonly replaying: Ref<boolean>
}

/** Host service of both forms. */
export const OPERATIONS = defineService<Operations>('presmium.operations')
