import { defineAppSetup } from '@slidev/types'

/** How long the app is held back once its modules have loaded, with no request in the meantime. */
const HOLD_MS = 10_000

// Slidev starts the app once its setups have run: until then the print page, loaded and idle, shows no slide.
export default defineAppSetup(async () => {
  await new Promise(resolve => setTimeout(resolve, HOLD_MS))
})
