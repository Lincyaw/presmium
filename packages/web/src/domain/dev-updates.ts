/** The Vite event by which the dev server pushes a document's update to the page. */
export const UPDATE_EVENT = 'presmium:update'

/** An update of the IR from the IR revision `base` to the IR revision `revision`. */
export interface DevUpdateEvent<Update = unknown> {
  update: Update
  base: string
  revision: string
}
