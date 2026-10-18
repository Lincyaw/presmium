import { driver } from 'driver.js'
import type { Config, Driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import './spotlight.css'
import { sameCue } from './cue.ts'
import type { CueRequest } from './cue.ts'

const requests = new Map<object, CueRequest>()
let current: { driver: Driver; animate: boolean } | undefined
let lit: { element: HTMLElement; tabindex: boolean } | undefined

function config(animate: boolean): Config {
  return {
    animate,
    allowClose: false,
    allowKeyboardControl: false,
    overlayClickBehavior: 'none',
    showButtons: [],
    smoothScroll: false,
    stagePadding: 8,
    stageRadius: 8,
    popoverClass: 'pm-spotlight-popover',
    onHighlightStarted: () => document.body.classList.remove('driver-active'),
  }
}

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex], [contenteditable]'

function light(element: HTMLElement | undefined): void {
  if (lit?.element === element) return
  if (lit?.tabindex) lit.element.removeAttribute('tabindex')
  lit = element && { element, tabindex: !element.matches(FOCUSABLE) }
  if (lit?.tabindex) element!.setAttribute('tabindex', '-1')
}

function focusLit(event: KeyboardEvent): void {
  if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || !lit || lit.element.contains(document.activeElement)) return
  event.preventDefault()
  event.stopImmediatePropagation()
  lit.element.focus({ preventScroll: true })
}

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
    window.addEventListener('keydown', focusLit, true)
  }
  const { element, title, text } = shown
  current.driver.highlight({ element, popover: title || text ? { title, description: text } : undefined })
}
