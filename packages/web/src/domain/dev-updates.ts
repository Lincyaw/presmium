/** The event by which a dev server tells a page that its document changed. */
export const UPDATE_EVENT = 'ir'

/**
 * A change of the document from the IR revision `base` to `revision`: the sections that changed (`update`) when the
 * page has `base`; otherwise the page reads the whole IR again.
 */
export interface DevUpdateEvent<Update = unknown> {
  revision: string
  base?: string
  update?: Update
}
