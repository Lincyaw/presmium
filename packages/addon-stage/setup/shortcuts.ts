import { defineShortcutsSetup } from '@slidev/types'
import { ref } from 'vue'
import { useScreen } from '../src/client/screen.ts'

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

export default defineShortcutsSetup((_nav, base) => [
  ...base,
  { name: 'presmium_stage_black', key: 'b', fn: () => useScreen().toggle('black') },
  { name: 'presmium_stage_freeze', key: freezeKey, fn: () => useScreen().toggle('frozen') },
])
