import { useNav } from '@slidev/client'
import { defineRootSetup } from '@slidev/types'
import { watchEffect } from 'vue'

// Exports and visual diffs capture final states: while Slidev prints (PDF and
// PNG export), style.css ends animations and transitions at once.
export default defineRootSetup(() => {
  const { isPrintMode } = useNav()
  watchEffect(() => document.documentElement.classList.toggle('pm-print', isPrintMode.value))
})
