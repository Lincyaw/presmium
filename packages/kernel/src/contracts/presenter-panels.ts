import type { Unsubscribe } from './plugin.ts'
import { defineService } from './service.ts'

export interface PresenterPanel {
  id: string
  title: string
  component: unknown
  order?: number
}

export interface PresenterPanels {
  register(panel: PresenterPanel): Unsubscribe
  list(): PresenterPanel[]
  subscribe(listener: () => void): Unsubscribe
}

export const PRESENTER_PANELS = defineService<PresenterPanels>('presmium.presenterPanels')
