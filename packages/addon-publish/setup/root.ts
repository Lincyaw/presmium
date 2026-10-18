import { useNav } from '@slidev/client'
import { defineRootSetup } from '@slidev/types'
import { watchEffect } from 'vue'
import { PRINT_FAILED, PRINT_READY } from './print.ts'

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
