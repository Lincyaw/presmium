/**
 * Demo plugins that show the kernel at work (the host tests use them, see
 * e2e/fixtures/core/deck): a provider, a consumer of its service, and a
 * plugin whose required service nobody provides. Enabled with
 * `presmium: { presmium.core: { demo: true } }`.
 */
import { currentLocale } from '@presmium/host'
import { defineService } from '@presmium/kernel'
import type { PluginDefinition } from '@presmium/kernel'
import { version } from '../../package.json'

export interface Greeter {
  greet(name: string): string
}

export const DEMO_GREETER = defineService<Greeter>('presmium.demo.greeter')
/** Provided by the consumer with text produced by the provider's greeter. */
export const DEMO_GREETING = defineService<string>('presmium.demo.greeting')
const DEMO_MISSING = defineService<unknown>('presmium.demo.missing')

const kernel = '^1.0.0'

// The consumer is listed first; the kernel still starts the provider before it.
export const demoPlugins: PluginDefinition[] = [
  {
    manifest: { id: 'presmium.demo.consumer', version, kernel, provides: [DEMO_GREETING], requires: [{ token: DEMO_GREETER }] },
    setup(ctx) {
      ctx.provide(DEMO_GREETING, ctx.get(DEMO_GREETER).greet('presmium.demo.consumer'))
    },
  },
  {
    manifest: { id: 'presmium.demo.provider', version, kernel, provides: [DEMO_GREETER] },
    setup(ctx) {
      ctx.provide(DEMO_GREETER, {
        greet: name => currentLocale() === 'zh-CN' ? `${name} 收到 presmium.demo.provider 的问候` : `${name} got a greeting from presmium.demo.provider`,
      })
    },
  },
  {
    manifest: { id: 'presmium.demo.orphan', version, kernel, requires: [{ token: DEMO_MISSING }] },
    setup() {},
  },
]
