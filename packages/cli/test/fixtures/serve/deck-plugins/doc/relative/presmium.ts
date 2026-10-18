// A plugin the deck names by a relative path: loading it leaves a marker next to it.
import { writeFileSync } from 'node:fs'

writeFileSync(new URL('./loaded', import.meta.url), 'loaded')

export default { id: 'fixture.relative', version: '0.1.0', kernel: '^1.0.0' }
