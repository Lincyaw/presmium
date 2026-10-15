import { describe, expect, it } from 'vitest'
import { ServiceRegistry, defineService } from '../src/index.ts'
import type { PluginManifest } from '../src/index.ts'

const A = defineService<number>('test.a')
const B = defineService<number>('test.b')

function manifest(id: string, extra: Partial<PluginManifest> = {}): PluginManifest {
  return { id, version: '1.0.0', kernel: '^0.1.0', ...extra }
}

describe('ServiceRegistry', () => {
  it('stores one implementation per token id', () => {
    const registry = new ServiceRegistry()
    registry.provide(A, 1, 'p')
    expect(registry.get(defineService<number>('test.a'))).toBe(1)
    expect(registry.owner(A)).toBe('p')
    expect(() => registry.provide(A, 2)).toThrow('already provided by p')
    expect(registry.tryGet(B)).toBeUndefined()
    expect(() => registry.get(B)).toThrow('test.b is not available')
  })

  it('revokes the services of one owner', () => {
    const registry = new ServiceRegistry()
    registry.provide(A, 1, 'p')
    registry.provide(B, 2)
    registry.revoke('p')
    expect(registry.ids()).toEqual(['test.b'])
  })

  it('plans a stable topological order with optional edges', () => {
    const plan = new ServiceRegistry().plan([
      manifest('late', { requires: [{ token: A, optional: true }] }),
      manifest('early', { provides: [A] }),
      manifest('free'),
    ])
    expect(plan.order).toEqual(['early', 'late', 'free'])
    expect(plan.cycles).toEqual([])
    expect(plan.excluded.size).toBe(0)
  })

  it('checks the kernel version range against the given version', () => {
    const plan = new ServiceRegistry().plan([manifest('p', { kernel: '^1.0.0' })], '1.4.0-beta.1')
    expect(plan.order).toEqual(['p'])
    expect(new ServiceRegistry().plan([manifest('p', { kernel: '^1.0.0' })], '2.0.0').excluded.get('p'))
      .toBe('kernel 2.0.0 does not satisfy "^1.0.0"')
  })
})
