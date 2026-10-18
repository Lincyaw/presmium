import { defineRootSetup } from '@slidev/types'
import { startSlidevPresmium } from '../src/client/start.ts'

export default defineRootSetup(() => {
  startSlidevPresmium()
})
