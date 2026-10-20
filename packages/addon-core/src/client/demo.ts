import { currentLocale } from '@lincyaw/host'
import { defineService } from '@lincyaw/kernel'
import type { PluginDefinition } from '@lincyaw/kernel'
import { version } from '../../package.json'

export interface Greeter {
  greet(name: string): string
}

export const DEMO_GREETER = defineService<Greeter>('presmium.demo.greeter')
export const DEMO_GREETING = defineService<string>('presmium.demo.greeting')
const DEMO_MISSING = defineService<unknown>('presmium.demo.missing')

const kernel = '^1.0.0'

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
