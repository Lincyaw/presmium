/**
 * Kernel plugins whose start the tests read in the start report: a provider of a greeting service,
 * a plugin that uses it and provides the greeting `fixture.host.greeting` (DemoGreeting of ../plugin
 * shows it), and one that requires a service nobody provides, so the kernel disables it. Plain
 * objects (a service token is `{ id }`), so the fixture needs no package of its own to compile.
 */
const kernel = '^1.0.0'
const version = '0.1.0'
const GREETER = Object.freeze({ id: 'fixture.host.greeter' })
const GREETING = Object.freeze({ id: 'fixture.host.greeting' })
const MISSING = Object.freeze({ id: 'fixture.host.missing' })

interface Greeter {
  greet(name: string): string
}

interface SetupContext {
  get(token: unknown): unknown
  provide(token: unknown, implementation: unknown): void
}

export default [
  {
    manifest: { id: 'fixture.host.consumer', version, kernel, provides: [GREETING], requires: [{ token: GREETER }] },
    setup(ctx: SetupContext) {
      ctx.provide(GREETING, (ctx.get(GREETER) as Greeter).greet('fixture.host.consumer'))
    },
  },
  {
    manifest: { id: 'fixture.host.provider', version, kernel, provides: [GREETER] },
    setup(ctx: SetupContext) {
      const greeter: Greeter = {
        greet: name => document.documentElement.lang.startsWith('zh') ? `${name} 收到 fixture.host.provider 的问候` : `${name} got a greeting from fixture.host.provider`,
      }
      ctx.provide(GREETER, greeter)
    },
  },
  {
    manifest: { id: 'fixture.host.orphan', version, kernel, requires: [{ token: MISSING }] },
    setup() {},
  },
]
