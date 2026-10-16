import { defineShortcutsSetup } from '@slidev/types'
import { ref } from 'vue'
import { useScreen } from '../src/client/screen.ts'

/**
 * Slidev binds a plain `f` to fullscreen outside the configurable shortcut list.
 * The stage takes the key for freezing: a plain `f` that is not typed into a
 * field stops at the document, before Slidev's window-level listeners, and drives
 * the freeze shortcut below instead.
 */
const freezeKey = ref(false)

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
}

document.addEventListener('keydown', (event) => {
  if (event.key !== 'f' || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return
  event.stopPropagation()
  freezeKey.value = true
})
document.addEventListener('keyup', (event) => {
  if (event.key.toLowerCase() === 'f') freezeKey.value = false
})
window.addEventListener('blur', () => {
  freezeKey.value = false
})

/** P-03: `b` blacks out the audience view, `f` freezes it; the same key again restores it. */
export default defineShortcutsSetup((_nav, base) => [
  ...base,
  { name: 'presmium_stage_black', key: 'b', fn: () => useScreen().toggle('black') },
  { name: 'presmium_stage_freeze', key: freezeKey, fn: () => useScreen().toggle('frozen') },
])
