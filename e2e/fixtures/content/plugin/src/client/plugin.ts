// The web form registers this kernel plugin as it registers every plugin's src/client/plugin.ts.
import { defineCounter } from '../../counter.ts'

export default { manifest: { id: 'fixture.content', version: '0.1.0', kernel: '^1.0.0' }, restartable: true, setup: defineCounter }
