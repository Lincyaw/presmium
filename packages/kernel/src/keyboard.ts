// Which key presses a page shortcut may take. Text entry, editors and open menus or dialogs keep every key. A control
// the keyboard moved to keeps the keys it uses itself: Space presses a button or toggles a checkbox, and the arrows move
// a slider, a select, a pane separator, the items of a toolbar or tab list, or scroll a focusable region. A click leaves the focus on the
// clicked control; Space and the arrows then mean what they mean everywhere else on the page (play or pause, the next
// step) instead of pressing that control again.

const TEXT = 'textarea, [contenteditable]:not([contenteditable="false"]), input:not([type="button"], [type="checkbox"], [type="radio"], [type="range"], [type="reset"], [type="submit"], [type="color"], [type="file"], [type="image"])'
const LAYER = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'
const PRESSABLE = 'button, a[href], summary, select, input, [role="button"], [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="option"], [role="treeitem"]'
const NAVIGABLE = 'select, input[type="range"], [role="slider"], [role="spinbutton"], [role="tablist"], [role="toolbar"], [role="radiogroup"], [role="grid"], [role="tree"], [role="menubar"]'
const NAVIGATION_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])

const sources = new WeakMap<Document, { pointer: boolean, byPointer: WeakSet<Element> }>()

/** Starts noting, in `document`, which elements took the focus from a pointer press. Call it before the first click. */
export function watchFocusSource(document: Document | undefined = globalThis.document): void {
  if (!document || sources.has(document)) return
  const source = { pointer: false, byPointer: new WeakSet<Element>() }
  sources.set(document, source)
  document.addEventListener('pointerdown', () => { source.pointer = true }, true)
  document.addEventListener('keydown', () => { source.pointer = false }, true)
  document.addEventListener('focusin', event => {
    const target = event.composedPath()[0]
    if (!(target instanceof Element)) return
    if (source.pointer) source.byPointer.add(target)
    else source.byPointer.delete(target)
  }, true)
}

/** Whether a key press belongs to the element it was pressed on, so that a page shortcut leaves it alone. */
export function keyBelongsToTarget(event: KeyboardEvent): boolean {
  if (event.isComposing || event.keyCode === 229) return true
  const target = event.composedPath?.()[0] ?? event.target
  if (!(target instanceof Element)) return false
  if ((target as HTMLElement).isContentEditable || target.closest(TEXT) || target.closest(LAYER)) return true
  if (event.key !== ' ' && !NAVIGATION_KEYS.has(event.key)) return false
  // Resize handles keep their keys after pointer focus too; resizing must never
  // navigate a teaching step or start its playback.
  if (target.closest('[role="separator"]')) return true
  if (sources.get(target.ownerDocument)?.byPointer.has(target)) return false
  const region = (target as HTMLElement).tabIndex >= 0 && !target.matches(`${PRESSABLE}, ${NAVIGABLE}`)
  return region || Boolean(target.closest(event.key === ' ' ? PRESSABLE : NAVIGABLE))
}
