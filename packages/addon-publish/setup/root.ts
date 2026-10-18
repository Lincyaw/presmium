import { useNav } from '@slidev/client'
import { defineRootSetup } from '@slidev/types'
import { watchEffect } from 'vue'
import { PRINT_FAILED, PRINT_READY } from './print.ts'

// Exports and visual diffs capture final states: while Slidev prints (PDF and
// PNG export), style.css ends animations and transitions at once. The exports
// of presmium-diff (which sets VITE_PRESMIUM_VISUAL_DIFF) also draw all text
// the same way in every capture. The print page says when it shows every
// slide (./print.ts).
export default defineRootSetup(() => {
  const nav = useNav()
  const { isPrintMode } = nav
  const visualDiff = import.meta.env.VITE_PRESMIUM_VISUAL_DIFF === '1'
  watchEffect(() => {
    document.documentElement.classList.toggle('pm-print', isPrintMode.value)
    document.documentElement.classList.toggle('pm-visual-diff', isPrintMode.value && visualDiff)
  })
  if (isPrintMode.value) void printed(nav)
})

const tick = () => new Promise(resolve => setTimeout(resolve, 50))

/**
 * Says when the print page can be captured: once the component of each of its
 * slides has loaded (`SlideRoute.load`) and the page shows them all, none
 * still loading. When a slide did not load (Slidev's loader then gives the
 * error layout, not the slide's module), says which instead. A page of one
 * slide in print mode (`slidev export --per-slide`) is ready as Slidev judges it.
 */
async function printed({ router, currentRoute, printRange, slides }: ReturnType<typeof useNav>): Promise<void> {
  await router.isReady()
  if (currentRoute.value.name === 'print') {
    const range = printRange.value
    const loaded = await Promise.all(range.map(no => slides.value[no - 1]!.load()))
    const failed = range.filter((_, i) => !('default' in loaded[i]!))
    if (failed.length > 0) {
      dispatchEvent(new CustomEvent(PRINT_FAILED, { detail: `slide ${failed.join(', ')} did not load` }))
      return
    }
    while (document.querySelectorAll('[data-slidev-no]').length < range.length || document.querySelector('.slidev-slide-loading')) await tick()
    await tick()
  }
  dispatchEvent(new Event(PRINT_READY))
}
