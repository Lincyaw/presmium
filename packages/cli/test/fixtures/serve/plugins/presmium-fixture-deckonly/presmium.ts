// A plugin package: installed only in the deck's node_modules it is refused (D14); installed at the
// workspace root and listed in settings.presmium.workspace.plugins it is loaded. Loading it leaves a marker.
import { writeFileSync } from 'node:fs'

writeFileSync(new URL('./loaded', import.meta.url), 'loaded')

export default { id: 'fixture.deckonly', version: '0.1.0', kernel: '^0.1.0' }
