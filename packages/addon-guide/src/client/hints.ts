import { hints } from 'driver.js/hints'
import type { DriverHint, Hints } from 'driver.js/hints'
import 'driver.js/dist/hints.css'
import './hints.css'
import { sameCue } from './cue.ts'
import type { CueRequest } from './cue.ts'

const requests = new Map<object, CueRequest>()
let beacons: Hints | undefined

function beacon({ element, title, text, animate }: CueRequest): DriverHint {
  return {
    element,
    beacon: { animate, className: 'pm-hint-beacon' },
    popover: title || text ? { title, description: text, showButton: false } : undefined,
  }
}

function release(event: FocusEvent) {
  const target = event.target
  if (target instanceof HTMLElement && target.closest('.pm-hint-beacon, .pm-hint-popover')) target.blur()
}

function create(): Hints {
  document.addEventListener('focusin', release)
  return hints({ popoverClass: 'pm-hint-popover' })
}

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
