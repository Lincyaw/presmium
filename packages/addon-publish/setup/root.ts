import { useNav } from '@slidev/client'
import { defineRootSetup } from '@slidev/types'
import { watchEffect } from 'vue'

// Exports and visual diffs capture final states: while Slidev prints (PDF and
// PNG export), style.css ends animations and transitions at once. The exports
// of presmium-diff (which sets VITE_PRESMIUM_VISUAL_DIFF) also draw all text
// the same way in every capture.
export default defineRootSetup(() => {
  const { isPrintMode } = useNav()
  const visualDiff = import.meta.env.VITE_PRESMIUM_VISUAL_DIFF === '1'
  watchEffect(() => {
    document.documentElement.classList.toggle('pm-print', isPrintMode.value)
    document.documentElement.classList.toggle('pm-visual-diff', isPrintMode.value && visualDiff)
  })
})
