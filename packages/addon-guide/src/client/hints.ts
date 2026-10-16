import { hints } from 'driver.js/hints'
import type { DriverHint, Hints } from 'driver.js/hints'
import 'driver.js/dist/hints.css'
import './hints.css'
import { sameCue } from './cue.ts'
import type { CueRequest } from './cue.ts'

// driver.js keeps one set of hint beacons per page; live hints share it.
const requests = new Map<object, CueRequest>()
let beacons: Hints | undefined

function beacon({ element, title, text, animate }: CueRequest): DriverHint {
  return {
    element,
    beacon: { animate, className: 'pm-hint-beacon' },
    // No "got it" button: it would dismiss the hint for good, and a hint must follow the step alone.
    popover: title || text ? { title, description: text, showButton: false } : undefined,
  }
}

// driver.js gives a beacon focus when it is clicked and when its popover closes, and focuses the
// popover when it opens. The host ignores arrow keys while a button has focus, so the focus goes
// back to the page: the deck keeps following the keyboard after a hint is opened.
function release(event: FocusEvent) {
  const target = event.target
  if (target instanceof HTMLElement && target.closest('.pm-hint-beacon, .pm-hint-popover')) target.blur()
}

function create(): Hints {
  document.addEventListener('focusin', release)
  return hints({ popoverClass: 'pm-hint-popover' })
}

/** Puts a pulsing beacon on the element; asking again for the same hint lays the beacons out again. */
export function requestHint(owner: object, request: CueRequest | undefined): void {
  if (sameCue(requests.get(owner), request)) {
    beacons?.refresh()
    return
  }
  if (request) requests.set(owner, request)
  else requests.delete(owner)
  beacons ??= create()
  beacons.hide()
  beacons.setHints([...requests.values()].map(beacon))
  if (requests.size) beacons.show()
}
