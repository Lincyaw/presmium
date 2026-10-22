import { defineStore } from '@deepseek-ai/dsh-client-store'

export const CENTRE_MIN = 400
export const RIGHTBAR_MIN = 300
export const RIGHTBAR_MAX_RATIO = 0.7
export const RIGHTBAR_DEFAULT_RATIO = 0.45
export const SIDE_COLLAPSE = 1024
export const NARROW = 768
export const ACTIVITY = 48
export const SIDE_DEFAULT = 264
export const SIDE_MIN = 200
export const SIDE_MAX = 420
export const CONVERSATION_DEFAULT = 400
export const CONVERSATION_MIN = 320
export const CONVERSATION_MAX = 640
/** The width of one resize handle between two columns. */
export const HANDLE = 8

export const clamp = (px: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(px)))

/** The width left for the rightbar column: the viewport less the activity bar, the side panel, the conversation, the centre's minimum and `handles` resize handles. */
export function rightbarRoom(viewport: number, side: number, conversation: number, handles: number): number {
  return viewport - ACTIVITY - side - conversation - CENTRE_MIN - handles * HANDLE
}

export type Activity = 'documents' | 'files' | 'changes' | 'sessions'
/** What a narrow screen shows, one at a time. */
export type NarrowPane = 'documents' | 'files' | 'source' | 'preview' | 'changes' | 'sessions' | 'conversation'

export interface LayoutState {
  panelInfo: { activePanelId: string | null }
  layoutInfo: {
    viewportWidth: number
    isSideOpen: boolean
    /** On a screen narrower than SIDE_COLLAPSE the side panel opens over the centre. */
    isSideExpanded: boolean
    sideWidth: number
    conversationWidth: number
    isConversationOpen: boolean
    rightbarWidth: number | null
    isRightbarOpen: boolean
    hasRightbarTrack: boolean
    isRightbarFullscreen: boolean
    activity: Activity
    narrowPane: NarrowPane
  }
}

const openConversationWidth = (info: LayoutState['layoutInfo']) => (info.isConversationOpen ? info.conversationWidth : 0)

function revealConversation(d: LayoutState): void {
  d.panelInfo.activePanelId = null
  d.layoutInfo.isConversationOpen = true
  d.layoutInfo.narrowPane = 'conversation'
  if (d.layoutInfo.viewportWidth < SIDE_COLLAPSE) d.layoutInfo.isSideExpanded = false
}

function showHistory(d: LayoutState): void {
  d.panelInfo.activePanelId = null
  d.layoutInfo.activity = 'sessions'
  d.layoutInfo.isSideOpen = true
  d.layoutInfo.narrowPane = 'sessions'
  if (d.layoutInfo.viewportWidth < SIDE_COLLAPSE) {
    d.layoutInfo.isSideExpanded = d.layoutInfo.viewportWidth >= NARROW
    d.layoutInfo.isConversationOpen = false
  } else d.layoutInfo.isConversationOpen = true
}

export function createLayoutStore() {
  return defineStore({
    init: (): LayoutState => ({
      panelInfo: { activePanelId: null },
      layoutInfo: {
        viewportWidth: window.innerWidth,
        isSideOpen: false,
        isSideExpanded: false,
        sideWidth: SIDE_DEFAULT,
        conversationWidth: CONVERSATION_DEFAULT,
        isConversationOpen: true,
        rightbarWidth: null,
        isRightbarOpen: false,
        hasRightbarTrack: false,
        isRightbarFullscreen: false,
        activity: 'files',
        narrowPane: 'documents',
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
        if ((d.layoutInfo.viewportWidth < SIDE_COLLAPSE) !== (width < SIDE_COLLAPSE)) d.layoutInfo.isSideExpanded = false
        d.layoutInfo.viewportWidth = width
        if (d.layoutInfo.hasRightbarTrack && rightbarRoom(width, d.layoutInfo.sideWidth, openConversationWidth(d.layoutInfo), 3) < RIGHTBAR_MIN) {
          d.layoutInfo.isSideOpen = false
          d.layoutInfo.isSideExpanded = false
        }
      },
      toggleSidebar: (d: LayoutState) => {
        if (d.layoutInfo.viewportWidth < SIDE_COLLAPSE) {
          d.layoutInfo.isSideExpanded = !d.layoutInfo.isSideExpanded
          if (d.layoutInfo.isSideExpanded) d.layoutInfo.isConversationOpen = false
        }
        else d.layoutInfo.isSideOpen = !d.layoutInfo.isSideOpen
      },
      setSideWidth: (d: LayoutState, px: number) => {
        d.layoutInfo.sideWidth = clamp(px, SIDE_MIN, SIDE_MAX)
      },
      setConversationWidth: (d: LayoutState, px: number) => {
        d.layoutInfo.conversationWidth = clamp(px, CONVERSATION_MIN, Math.min(CONVERSATION_MAX, d.layoutInfo.viewportWidth * 0.5))
      },
      setConversationOpen: (d: LayoutState, open: boolean) => {
        d.layoutInfo.isConversationOpen = open
        if (open && d.layoutInfo.viewportWidth < SIDE_COLLAPSE) d.layoutInfo.isSideExpanded = false
      },
      revealConversation,
      showHistory,
      toggleConversations: (d: LayoutState) => {
        const info = d.layoutInfo
        if (info.viewportWidth < NARROW) {
          if (info.narrowPane === 'conversation') showHistory(d)
          else revealConversation(d)
        } else {
          const historyShown = info.activity === 'sessions' && (info.viewportWidth < SIDE_COLLAPSE ? info.isSideExpanded : info.isSideOpen)
          if (historyShown && info.viewportWidth < SIDE_COLLAPSE) revealConversation(d)
          else if (historyShown && info.isConversationOpen) info.isSideOpen = false
          else showHistory(d)
        }
      },
      setRightbarWidth: (d: LayoutState, px: number) => {
        d.layoutInfo.rightbarWidth = clamp(px, RIGHTBAR_MIN, Math.max(RIGHTBAR_MIN, d.layoutInfo.viewportWidth * RIGHTBAR_MAX_RATIO))
      },
      openRightbar: (d: LayoutState, track: boolean, fullscreen: boolean) => {
        const info = d.layoutInfo
        if (track && rightbarRoom(info.viewportWidth, info.sideWidth, openConversationWidth(info), 3) < RIGHTBAR_MIN) {
          info.isSideOpen = false
          info.isSideExpanded = false
        }
        if (track && rightbarRoom(info.viewportWidth, 0, openConversationWidth(info), 2) < RIGHTBAR_MIN) info.isConversationOpen = false
        info.rightbarWidth ??= Math.max(RIGHTBAR_MIN, Math.round(info.viewportWidth * RIGHTBAR_DEFAULT_RATIO * 0.6))
        info.isRightbarOpen = true
        info.hasRightbarTrack = track
        info.isRightbarFullscreen = fullscreen
      },
      closeRightbar: (d: LayoutState) => {
        d.layoutInfo.isRightbarOpen = false
        d.layoutInfo.hasRightbarTrack = false
        d.layoutInfo.isRightbarFullscreen = false
      },
      /** An activity of the activity bar: opens the side panel on it, or toggles it on a wide screen. */
      selectActivity: (d: LayoutState, activity: Activity) => {
        if (d.layoutInfo.activity === activity && d.layoutInfo.viewportWidth >= SIDE_COLLAPSE) d.layoutInfo.isSideOpen = !d.layoutInfo.isSideOpen
        else d.layoutInfo.isSideOpen = true
        d.layoutInfo.activity = activity
        if (d.layoutInfo.viewportWidth < SIDE_COLLAPSE) {
          d.layoutInfo.isSideExpanded = d.layoutInfo.viewportWidth >= NARROW
          if (d.layoutInfo.isSideExpanded) d.layoutInfo.isConversationOpen = false
        }
        d.layoutInfo.narrowPane = activity
      },
      showNarrowPane: (d: LayoutState, pane: NarrowPane) => {
        d.layoutInfo.narrowPane = pane
        d.layoutInfo.isSideExpanded = false
      },
    },
  })
}

export type LayoutStore = ReturnType<typeof createLayoutStore>
export type LayoutActions = ReturnType<LayoutStore['create']>['actions']

export class LayoutController {
  #navigation = new AbortController()
  #preserveNextConversation = false
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
    if (id === null && !this.#preserveNextConversation) this.#actions.revealConversation()
    this.#preserveNextConversation = false
  }

  /** Initial workspace binding must not replace the author's current view. Called by openWorkspace's beforeOpen. */
  preserveNextConversation(): void {
    this.#preserveNextConversation = true
  }

  /** Source navigation selects the document without revealing the conversation. */
  showDocument(): void {
    this.#navigation.abort()
    this.#actions.selectPanel(null)
    this.#actions.showNarrowPane('source')
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
