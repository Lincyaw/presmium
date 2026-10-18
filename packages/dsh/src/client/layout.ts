import { defineStore } from '@deepseek-ai/dsh-client-store'

export const CENTER_MIN = 400
export const RIGHTBAR_MIN = 300
export const RIGHTBAR_MAX_RATIO = 0.7
export const RIGHTBAR_DEFAULT_RATIO = 0.45
export const SIDE_COLLAPSE = 1024
export const NARROW = 768
export const ACTIVITY = 48
export const SIDE_DEFAULT = 264
export const SIDE_MIN = 200
export const SIDE_MAX = 420
export const DOCK_DEFAULT = 400
export const DOCK_MIN = 320
export const DOCK_MAX = 640

export const clamp = (px: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(px)))

export type Activity = 'documents' | 'files' | 'sessions'
export type NarrowView = 'documents' | 'files' | 'source' | 'preview' | 'sessions' | 'conversation'

export interface LayoutState {
  panelInfo: { activePanelId: string | null }
  layoutInfo: {
    viewportWidth: number
    sideOpen: boolean
    sideExpanded: boolean
    side: number
    dock: number
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
