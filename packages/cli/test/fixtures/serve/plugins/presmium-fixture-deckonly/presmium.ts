// A plugin package installed only in the deck's node_modules: presmium serve loads it, as presmium dev
// does. Loading it leaves a marker.
import { writeFileSync } from 'node:fs'

writeFileSync(new URL('./loaded', import.meta.url), 'loaded')

export default { id: 'fixture.deckonly', version: '0.1.0', kernel: '^1.0.0' }
