/**
 * A page cached from before a deployment names an app version the deployment removed: its modules then fail to load
 * ("Failed to fetch dynamically imported module", and the like in other browsers). The page's head answers the event
 * below with one reload from the network (`STALE_RELOAD` in @lincyaw/web's page HTML).
 */
export const STALE_MODULE_PATTERN = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i

/** The event a page dispatches on `window` when a module of it failed for a removed version. */
export const STALE_MODULE_EVENT = 'presmium:stale-module'

/** Reports a module load failure that a removed version explains; other failures are left alone. */
export function reportStaleModule(error: unknown): void {
  if (typeof window === 'undefined' || !STALE_MODULE_PATTERN.test(String(error instanceof Error ? error.message : error))) return
  window.dispatchEvent(new Event(STALE_MODULE_EVENT))
}
