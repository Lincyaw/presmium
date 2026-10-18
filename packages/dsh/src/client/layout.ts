/**
 * `ctx.layout`, which the root layout provides in place of `dsh-client-ui-layout`
 * (docs/design-dsh.md 7.2): DeepSeek Harness's sidebar, right dock, workspace,
 * plugin manager and open-in-app plugins call `selectPanel`, `beginNavigation`,
 * `toggleSidebar`, `openRightbar` and `closeRightbar` and read `panelInfo`; the
 * same contract (ui-layout's README and its published declarations), with
 * Presmium's geometry: an activity bar, a side panel, the centre, the right dock's
 * track and the conversation docked at the right. The store keeps the panel
 * selection apart from the measurements and the widths the author dragged.
 */
import { defineStore } from '@deepseek-ai/dsh-client-store'

/** The centre's width the right dock keeps free, and the dock's narrowest normal width (ui-layout's). */
export const CENTER_MIN = 400
export const RIGHTBAR_MIN = 300
export const RIGHTBAR_MAX_RATIO = 0.7
export const RIGHTBAR_DEFAULT_RATIO = 0.45
/** Below these widths the side panel collapses, and the frame shows one view at a time (7.7). */
export const SIDE_COLLAPSE = 1024
export const NARROW = 768
/** The activity bar, and the side panel's and the conversation's widths (dragged within these). */
export const ACTIVITY = 48
export const SIDE_DEFAULT = 264
export const SIDE_MIN = 200
export const SIDE_MAX = 420
export const DOCK_DEFAULT = 400
export const DOCK_MIN = 320
export const DOCK_MAX = 640

export const clamp = (px: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(px)))

/** What the side panel shows, chosen in the activity bar. */
export type Activity = 'documents' | 'files' | 'sessions'
/** On a narrow screen the frame shows one view at a time. */
export type NarrowView = 'documents' | 'files' | 'source' | 'preview' | 'sessions' | 'conversation'

export interface LayoutState {
  panelInfo: { activePanelId: string | null }
  layoutInfo: {
    viewportWidth: number
    /** The side panel is open (wide screens); on screens below SIDE_COLLAPSE, `sideExpanded` overrides. */
    sideOpen: boolean
    sideExpanded: boolean
    side: number
    dock: number
    /** The right dock's width preference, null before its first opening. */
    rightbar: number | null
    rightbarShown: boolean
    rightbarTrack: boolean
    rightbarFullscreen: boolean
    activity: Activity
    view: NarrowView
  }
}

export function createLayoutStore() {
  return defineStore({
    init: (): LayoutState => ({
      panelInfo: { activePanelId: null },
      layoutInfo: {
        viewportWidth: window.innerWidth,
        sideOpen: true,
        sideExpanded: false,
        side: SIDE_DEFAULT,
        dock: DOCK_DEFAULT,
        rightbar: null,
        rightbarShown: false,
        rightbarTrack: false,
        rightbarFullscreen: false,
        activity: 'files',
        view: 'documents',
      },
    }),
    actions: {
      selectPanel: (d: LayoutState, id: string | null) => {
        d.panelInfo.activePanelId = id
      },
      retainMainPanels: (d: LayoutState, ids: readonly string[]) => {
        if (d.panelInfo.activePanelId !== null && !ids.includes(d.panelInfo.activePanelId)) d.panelInfo.activePanelId = null
      },
      setViewportWidth: (d: LayoutState, width: number) => {
        if ((d.layoutInfo.viewportWidth < SIDE_COLLAPSE) !== (width < SIDE_COLLAPSE)) d.layoutInfo.sideExpanded = false
        d.layoutInfo.viewportWidth = width
      },
      toggleSidebar: (d: LayoutState) => {
        if (d.layoutInfo.viewportWidth < SIDE_COLLAPSE) d.layoutInfo.sideExpanded = !d.layoutInfo.sideExpanded
        else d.layoutInfo.sideOpen = !d.layoutInfo.sideOpen
      },
      setSide: (d: LayoutState, px: number) => {
        d.layoutInfo.side = clamp(px, SIDE_MIN, SIDE_MAX)
      },
      setDock: (d: LayoutState, px: number) => {
        d.layoutInfo.dock = clamp(px, DOCK_MIN, Math.min(DOCK_MAX, d.layoutInfo.viewportWidth * 0.5))
      },
      setRightbar: (d: LayoutState, px: number) => {
        d.layoutInfo.rightbar = clamp(px, RIGHTBAR_MIN, Math.max(RIGHTBAR_MIN, d.layoutInfo.viewportWidth * RIGHTBAR_MAX_RATIO))
      },
      openRightbar: (d: LayoutState, track: boolean, fullscreen: boolean) => {
        d.layoutInfo.rightbar ??= Math.max(RIGHTBAR_MIN, Math.round(d.layoutInfo.viewportWidth * RIGHTBAR_DEFAULT_RATIO * 0.6))
        d.layoutInfo.rightbarShown = true
        d.layoutInfo.rightbarTrack = track
        d.layoutInfo.rightbarFullscreen = fullscreen
      },
      closeRightbar: (d: LayoutState) => {
        d.layoutInfo.rightbarShown = false
        d.layoutInfo.rightbarTrack = false
        d.layoutInfo.rightbarFullscreen = false
      },
      /** The activity bar: a side panel's content (wide screens), the view (narrow ones). */
      choose: (d: LayoutState, activity: Activity) => {
        if (d.layoutInfo.activity === activity && d.layoutInfo.viewportWidth >= SIDE_COLLAPSE) d.layoutInfo.sideOpen = !d.layoutInfo.sideOpen
        else d.layoutInfo.sideOpen = true
        d.layoutInfo.activity = activity
        if (d.layoutInfo.viewportWidth < SIDE_COLLAPSE) d.layoutInfo.sideExpanded = d.layoutInfo.viewportWidth >= NARROW
        d.layoutInfo.view = activity
      },
      show: (d: LayoutState, view: NarrowView) => {
        d.layoutInfo.view = view
        d.layoutInfo.sideExpanded = false
      },
    },
  })
}

export type LayoutStore = ReturnType<typeof createLayoutStore>
export type LayoutActions = ReturnType<LayoutStore['create']>['actions']

/** `ctx.layout`: the panel actions other plugins reach for, writing through the store's actions. */
export class LayoutController {
  #navigation = new AbortController()
  readonly #actions: LayoutActions
  readonly #hasMainPanel: (id: string) => boolean
  readonly panelInfo: DshObservable<LayoutState['panelInfo']>

  constructor(actions: LayoutActions, hasMainPanel: (id: string) => boolean, panelInfo: DshObservable<LayoutState['panelInfo']>) {
    this.#actions = actions
    this.#hasMainPanel = hasMainPanel
    this.panelInfo = panelInfo
  }

  /** Selects a global panel of the centre, or (null) Presmium's own centre; the conversation stays docked. */
  selectPanel(id: string | null): void {
    if (id !== null && !this.#hasMainPanel(id)) throw new Error(`layout.selectPanel: main panel "${id}" is not registered`)
    this.#navigation.abort()
    this.#actions.selectPanel(id)
  }

  beginNavigation(): AbortSignal {
    this.#navigation.abort()
    this.#navigation = new AbortController()
    return this.#navigation.signal
  }

  toggleSidebar(): void {
    this.#actions.toggleSidebar()
  }

  openRightbar(track: boolean, fullscreen: boolean): void {
    this.#actions.openRightbar(track, fullscreen)
  }

  closeRightbar(): void {
    this.#actions.closeRightbar()
  }

  dispose(): void {
    this.#navigation.abort()
  }
}
