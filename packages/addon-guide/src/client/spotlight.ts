import { driver } from 'driver.js'
import type { Config, Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './spotlight.css'
import { sameCue } from './cue.ts'
import type { CueRequest } from './cue.ts'

// driver.js keeps one highlight per page, so live spotlights share one driver.
// The latest request is shown; when it ends, the previous one comes back.
const requests = new Map<object, CueRequest>()
let current: { driver: Driver; animate: boolean } | undefined
/** The element shown in the spotlight, and whether we made it focusable. */
let lit: { element: HTMLElement; tabindex: boolean } | undefined

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
    // driver.js makes the rest of the page inert while it highlights (body.driver-active). On a
    // slide the host's navigation and overview and the slide's own widgets stay usable; the
    // overlay lets pointer events through (see PmSpotlight.vue).
    onHighlightStarted: () => document.body.classList.remove('driver-active'),
  }
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable]'

/** The spotlit element takes the focus by Tab even when it holds no control (N-06). */
function light(element: HTMLElement | undefined): void {
  if (lit?.element === element) return
  if (lit?.tabindex) lit.element.removeAttribute('tabindex')
  lit = element && { element, tabindex: !element.matches(FOCUSABLE) }
  if (lit?.tabindex) element!.setAttribute('tabindex', '-1')
}

/**
 * driver.js keeps the focus on the spotlight with Tab, but only on the links
 * and form controls of the popover and the element: on any other element it
 * swallowed the key. Tab from outside the spotlit element now focuses it;
 * inside it, driver.js moves the focus among its controls.
 */
function focusLit(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || !lit || lit.element.contains(document.activeElement)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  lit.element.focus({ preventScroll: true })
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
  light(shown?.element)
  if (current && current.animate !== shown?.animate) {
    current.driver.destroy()
    current = undefined
    window.removeEventListener('keydown', focusLit, true)
  }
  if (!shown) return
  if (!current) {
    current = { driver: driver(config(shown.animate)), animate: shown.animate }
    // Before driver.js's own listener on the window, which listens without capture.
    window.addEventListener('keydown', focusLit, true)
  }
  const { element, title, text } = shown
  current.driver.highlight({ element, popover: title || text ? { title, description: text } : undefined })
}
