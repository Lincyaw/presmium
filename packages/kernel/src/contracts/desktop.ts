/** The installed app's bounded window/update bridge; ordinary browser sessions have no bridge. */
export interface DesktopUpdateState {
  phase: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'installing' | 'error'
  version?: string
  progress?: number
}

export interface DesktopState {
  version: string
  platform: 'darwin' | 'win32' | 'linux'
  fullscreen: boolean
  update: DesktopUpdateState
}

export interface DesktopHost {
  getSnapshot(): DesktopState
  subscribe(changed: () => void): () => void
  activateUpdate(): Promise<void>
}

declare global {
  interface Window { presmiumDesktop?: DesktopHost }
}
