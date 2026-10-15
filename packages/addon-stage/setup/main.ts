import { drawingState, mode } from '@slidev/client'
import { defineAppSetup } from '@slidev/types'
import { watch } from 'vue'
import { CLEAR_DRAWING } from '../src/domain/index.ts'

/** In the dev server, a slide whose drawing was cleared has its saved drawing removed (see ./vite-plugins.ts). */
export default defineAppSetup(() => {
  if (mode !== 'dev') return
  let drawn = new Set<string>()
  watch(() => Object.keys(drawingState).filter(page => drawingState[Number(page)]), (pages) => {
    for (const page of drawn) {
      if (!pages.includes(page)) void fetch(`${import.meta.env.BASE_URL}${CLEAR_DRAWING.slice(1)}?page=${page}`, { method: 'POST' })
    }
    drawn = new Set(pages)
  }, { immediate: true })
})
