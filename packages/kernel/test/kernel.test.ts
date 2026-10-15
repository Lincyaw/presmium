import { describe, expect, it, vi } from 'vitest'
import { Kernel, SESSION, defineService } from '../src/index.ts'
import type {
  KernelEvent,
  Logger,
  PluginDefinition,
  PluginManifest,
  ServiceRequirement,
  ServiceToken,
  SessionService,
} from '../src/index.ts'

const quietLog: Logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

const A = defineService<string>('test.a')
const B = defineService<string>('test.b')
const C = defineService<string>('test.c')

interface Spec {
  provides?: ServiceToken<any>[]
  requires?: ServiceRequirement[]
  kernel?: string
  setup?: PluginDefinition['setup']
}

/** A plugin that records its setup call and provides each declared service as its own id. */
function plugin(id: string, spec: Spec, calls: string[] = []): PluginDefinition {
  const manifest: PluginManifest = {
    id,
    version: '1.0.0',
    kernel: spec.kernel ?? '^0.1.0',
    provides: spec.provides,
    requires: spec.requires,
  }
  return {
    manifest,
    async setup(ctx) {
      calls.push(id)
      for (const token of spec.provides ?? []) ctx.provide(token, `${id}:${token.id}`)
      await spec.setup?.(ctx)
    },
  }
}

async function start(plugins: PluginDefinition[], kernel = new Kernel({ mode: 'slides', log: quietLog })) {
  for (const p of plugins) kernel.register(p)
  const report = await kernel.start()
  const status = Object.fromEntries(report.plugins.map(r => [r.id, r.status]))
  return { kernel, report, status }
}

describe('Kernel', () => {
  it('initializes plugins in dependency order', async () => {
    const calls: string[] = []
    const { report } = await start([
      plugin('c', { requires: [{ token: B }] }, calls),
      plugin('b', { provides: [B], requires: [{ token: A }] }, calls),
      plugin('a', { provides: [A] }, calls),
      plugin('d', {}, calls),
    ])
    expect(calls).toEqual(['a', 'b', 'c', 'd'])
    expect(report.order).toEqual(calls)
    expect(report.plugins.map(r => r.status)).toEqual(['started', 'started', 'started', 'started'])
  })

  it('disables a plugin whose required service is missing and degrades one whose optional service is missing', async () => {
    let optional: string | undefined = 'unset'
    const { report, status } = await start([
      plugin('needs', { requires: [{ token: A }] }),
      plugin('wants', {
        requires: [{ token: A, optional: true }],
        setup: ctx => {
          optional = ctx.tryGet(A)
        },
      }),
    ])
    expect(status).toEqual({ needs: 'disabled', wants: 'degraded' })
    expect(report.plugins[0]).toMatchObject({ missing: ['test.a'], reason: expect.stringContaining('test.a') })
    expect(report.plugins[1]).toMatchObject({ missing: ['test.a'] })
    expect(optional).toBeUndefined()
    expect(report.order).toEqual(['wants'])
  })

  it('disables every plugin on a dependency cycle and reports the cycle', async () => {
    const { report, status } = await start([
      plugin('x', { provides: [A], requires: [{ token: C }] }),
      plugin('y', { provides: [B], requires: [{ token: A }] }),
      plugin('z', { provides: [C], requires: [{ token: B, optional: true }] }),
      plugin('self', { provides: [defineService('test.self')], requires: [{ token: defineService('test.self') }] }),
      plugin('after', { requires: [{ token: A }] }),
      plugin('free', {}),
    ])
    expect(report.cycles).toEqual([['x', 'z', 'y'], ['self']])
    expect(status).toEqual({ x: 'disabled', y: 'disabled', z: 'disabled', self: 'disabled', after: 'disabled', free: 'started' })
    expect(report.plugins[0]!.reason).toBe('dependency cycle: x -> z -> y -> x')
    expect(report.plugins[4]).toMatchObject({ missing: ['test.a'] })
  })

  it('disables plugins whose kernel range is incompatible or invalid', async () => {
    const { report, status } = await start([
      plugin('future', { kernel: '^2.0.0', provides: [A] }),
      plugin('broken', { kernel: 'not a range' }),
      plugin('current', { kernel: '>=0.1.0 <1' }),
      plugin('dependent', { requires: [{ token: A }] }),
    ])
    expect(status).toEqual({ future: 'disabled', broken: 'disabled', current: 'started', dependent: 'disabled' })
    expect(report.plugins[0]!.reason).toContain('^2.0.0')
    expect(report.plugins[1]!.reason).toContain('invalid kernel range')
  })

  it('limits a setup failure to the plugin and the plugins that require it', async () => {
    const { kernel, report, status } = await start([
      plugin('boom', { provides: [A], setup: async () => Promise.reject(new Error('kaput')) }),
      plugin('needs', { provides: [C], requires: [{ token: A }] }),
      plugin('needsNeeds', { requires: [{ token: C }] }),
      plugin('wants', { requires: [{ token: A, optional: true }] }),
      plugin('other', { provides: [B] }),
    ])
    expect(status).toEqual({ boom: 'failed', needs: 'disabled', needsNeeds: 'disabled', wants: 'degraded', other: 'started' })
    expect(report.plugins[0]!.reason).toBe('kaput')
    expect(kernel.getService(A)).toBeUndefined()
    expect(kernel.getService(B)).toBe('other:test.b')
  })

  it('fails a plugin that does not provide a declared service', async () => {
    const def: PluginDefinition = { manifest: { id: 'p', version: '1.0.0', kernel: '^0.1.0', provides: [A] }, setup() {} }
    const { report } = await start([def, plugin('q', { requires: [{ token: A }] })])
    expect(report.plugins[0]).toMatchObject({ status: 'failed', reason: expect.stringContaining('test.a') })
    expect(report.plugins[1]!.status).toBe('disabled')
  })

  it('gives dependents the replacement when the session implementation is swapped', async () => {
    const sessionPlugin = (id: string, impl: SessionService): PluginDefinition => ({
      manifest: { id, version: '1.0.0', kernel: '^0.1.0', provides: [SESSION] },
      setup: ctx => ctx.provide(SESSION, impl),
    })
    // A dependent that defines its own token object with the same id, as a separate package would.
    const SessionToken = defineService<SessionService>('presmium.session')
    const quiz = () => {
      const seen: SessionService[] = []
      const def: PluginDefinition = {
        manifest: { id: 'quiz', version: '1.0.0', kernel: '^0.1.0', requires: [{ token: SessionToken }] },
        setup: ctx => {
          seen.push(ctx.get(SessionToken))
        },
      }
      return { def, seen }
    }
    const original = { name: 'original' } as unknown as SessionService
    const replacement = { name: 'replacement' } as unknown as SessionService

    const first = quiz()
    await start([first.def, sessionPlugin('session.yjs', original)])
    const second = quiz()
    await start([second.def, sessionPlugin('session.mock', replacement)])

    expect(first.seen).toEqual([original])
    expect(second.seen).toEqual([replacement])
  })

  it('disables a second provider of the same service', async () => {
    const { report, status } = await start([plugin('one', { provides: [A] }), plugin('two', { provides: [A] })])
    expect(status).toEqual({ one: 'started', two: 'disabled' })
    expect(report.plugins[1]!.reason).toContain('already provided by one')
  })

  it('treats host services as available and keeps them ahead of plugins', async () => {
    const kernel = new Kernel({ mode: 'document', log: quietLog })
    kernel.provide(A, 'host value')
    let seen: string | undefined
    const { status } = await start(
      [
        plugin('reader', { requires: [{ token: A }], setup: ctx => void (seen = ctx.get(A)) }),
        plugin('shadow', { provides: [A] }),
      ],
      kernel,
    )
    expect(seen).toBe('host value')
    expect(status).toEqual({ reader: 'started', shadow: 'disabled' })
  })

  it('exposes config, mode and declared services through the plugin context', async () => {
    const kernel = new Kernel({ mode: 'document', log: quietLog, config: { p: { level: 2 }, other: 1 } })
    let ctxSeen: { config: unknown; mode: string } | undefined
    let undeclared: unknown
    const { status } = await start(
      [
        plugin('p', {
          setup: ctx => {
            ctxSeen = { config: ctx.config, mode: ctx.mode }
            undeclared = (() => {
              try {
                return ctx.tryGet(B)
              } catch (error) {
                return error
              }
            })()
          },
        }),
      ],
      kernel,
    )
    expect(status).toEqual({ p: 'started' })
    expect(ctxSeen).toEqual({ config: { level: 2 }, mode: 'document' })
    expect(String(undeclared)).toContain('did not declare service test.b')
  })

  it('fails a plugin that provides a service it did not declare', async () => {
    const { report } = await start([plugin('p', { setup: ctx => ctx.provide(A, 'x') })])
    expect(report.plugins[0]).toMatchObject({ status: 'failed', reason: expect.stringContaining('test.a') })
  })

  it('emits lifecycle events', async () => {
    const kernel = new Kernel({ mode: 'slides', log: quietLog })
    const events: KernelEvent[] = []
    for (const type of ['started', 'degraded', 'disabled', 'failed'] as const) {
      kernel.events.on<KernelEvent>(`kernel.plugin.${type}`, e => events.push(e))
    }
    await start(
      [
        plugin('ok', {}),
        plugin('deg', { requires: [{ token: A, optional: true }] }),
        plugin('off', { requires: [{ token: A }] }),
        plugin('bad', { setup: () => { throw new Error('nope') } }),
      ],
      kernel,
    )
    expect(events).toEqual([
      { type: 'kernel.plugin.started', payload: { id: 'ok' } },
      { type: 'kernel.plugin.degraded', payload: { id: 'deg', missing: ['test.a'] } },
      { type: 'kernel.plugin.disabled', payload: { id: 'off', reason: 'missing required services: test.a' } },
      { type: 'kernel.plugin.failed', payload: { id: 'bad', error: 'nope' } },
    ])
  })

  it('rejects duplicate ids, late registration and a second start', async () => {
    const kernel = new Kernel({ mode: 'slides', log: quietLog })
    kernel.register(plugin('a', {}))
    expect(() => kernel.register(plugin('a', {}))).toThrow('already registered')
    await kernel.start()
    expect(kernel.report()?.order).toEqual(['a'])
    expect(() => kernel.register(plugin('b', {}))).toThrow('already started')
    await expect(kernel.start()).rejects.toThrow('already started')
  })

  it('disposes running plugins in reverse order and revokes their services', async () => {
    const disposed: string[] = []
    const withDispose = (p: PluginDefinition, fail = false): PluginDefinition => ({
      ...p,
      dispose: () => {
        disposed.push(p.manifest.id)
        if (fail) throw new Error('dispose failed')
      },
    })
    const { kernel } = await start([
      withDispose(plugin('b', { requires: [{ token: A }] }), true),
      withDispose(plugin('a', { provides: [A] })),
      withDispose(plugin('off', { requires: [{ token: C }] })),
    ])
    await kernel.dispose()
    expect(disposed).toEqual(['b', 'a'])
    expect(kernel.getService(A)).toBeUndefined()
  })
})
