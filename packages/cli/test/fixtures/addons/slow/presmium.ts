// Test-only plugin whose pass takes a second, as compile-time execution can.
import { setTimeout } from 'node:timers/promises'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'

const plugin: PresmiumNodePlugin = {
  id: 'fixture.slow',
  passes: [{ name: 'fixture.slow.wait', run: () => setTimeout(1000).then(() => undefined) }],
}

export default plugin
