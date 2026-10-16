// A replacement web renderer the deck names by a relative path (`renderers.web.package`): loading it
// leaves a marker next to it (D14's refusal case).
import { writeFileSync } from 'node:fs'

writeFileSync(new URL('./loaded', import.meta.url), 'loaded')

export default {
  id: 'fixture.renderer',
  version: '0.1.0',
  kernel: '^0.1.0',
  renderer: { id: 'web', support: () => 'full', build: async () => ({ outDir: '', skipped: [] }) },
}
