// Test-only plugin written for a kernel that does not exist yet: the compiler refuses it, and the slides do not take it as an addon.
import type { PresmiumNodePlugin } from '@lincyaw/kernel'

const plugin: PresmiumNodePlugin = { id: 'fixture.slides-future', version: '2.0.0', kernel: '^9.0.0' }

export default plugin
