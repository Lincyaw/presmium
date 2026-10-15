import { driver } from 'driver.js'
import type { Config, Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { sameCue } from './cue.ts'
import type { CueRequest } from './cue.ts'

// driver.js keeps one highlight per page, so live spotlights share one driver.
// The latest request is shown; when it ends, the previous one comes back.
const requests = new Map<object, CueRequest>()
let current: { driver: Driver; animate: boolean } | undefined

function config(animate: boolean): Config {
  return {
    animate,
    // Navigation stays with the host: no keyboard control, no closing, no buttons.
    allowClose: false,
    allowKeyboardControl: false,
    overlayClickBehavior: 'none',
    showButtons: [],
    smoothScroll: false,
    stagePadding: 8,
    stageRadius: 8,
    popoverClass: 'pm-spotlight-popover',
  }
}

/** Dims the page around the element; asking again for the same spotlight lays it out again. */
export function requestSpotlight(owner: object, request: CueRequest | undefined): void {
  if (sameCue(requests.get(owner), request)) {
    current?.driver.refresh()
    return
  }
  requests.delete(owner)
  if (request) requests.set(owner, request)
  const shown = [...requests.values()].at(-1)
  if (current && current.animate !== shown?.animate) {
    current.driver.destroy()
    current = undefined
  }
  if (!shown) return
  current ??= { driver: driver(config(shown.animate)), animate: shown.animate }
  const { element, title, text } = shown
  current.driver.highlight({ element, popover: title || text ? { title, description: text } : undefined })
}
