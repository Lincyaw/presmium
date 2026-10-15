import { describe, expect, it } from 'vitest'
import { createAnchorResolverRegistry, parseAnchor } from '../src/index.ts'
import type { AnchorResolver, Resolution, SourceReader } from '../src/index.ts'

const src: SourceReader = { read: async () => undefined }

function resolver(scheme: string, resolution: Resolution, calls: unknown[][] = []): AnchorResolver {
  return {
    scheme,
    async resolve(...args) {
      calls.push(args)
      return resolution
    },
  }
}

describe('parseAnchor', () => {
  it('splits scheme and target at the first colon', () => {
    expect(parseAnchor('region:src/a.py#add')).toEqual({ scheme: 'region', target: 'src/a.py#add' })
    expect(parseAnchor('symbol:a.ts#A::b')).toEqual({ scheme: 'symbol', target: 'a.ts#A::b' })
  })

  it('rejects anchors without a scheme or target', () => {
    for (const bad of ['src/a.py', ':x', 'region:', '1x:y', 'a b:c']) expect(parseAnchor(bad)).toBeUndefined()
  })
})

describe('AnchorResolverRegistry', () => {
  it('dispatches by scheme and passes the recorded anchor and ref through', async () => {
    const calls: unknown[][] = []
    const region = resolver('region', { status: 'exact', fingerprint: 'f' }, calls)
    const registry = createAnchorResolverRegistry([region, resolver('symbol', { status: 'moved' })])
    const recorded = { fingerprint: 'f', file: 'src/a.py', startLine: 3 }

    expect(await registry.resolve('region:src/a.py#add', src, recorded, 'abc123')).toEqual({ status: 'exact', fingerprint: 'f' })
    expect(calls).toEqual([['region:src/a.py#add', src, recorded, 'abc123']])
    expect((await registry.resolve('symbol:src/a.py#f', src)).status).toBe('moved')
    expect(registry.schemes()).toEqual(['region', 'symbol'])
  })

  it('returns lost with an explanation for an unknown scheme', async () => {
    const registry = createAnchorResolverRegistry([resolver('region', { status: 'exact' })])
    const result = await registry.resolve('line:src/a.py#10', src)
    expect(result.status).toBe('lost')
    expect(result.message).toContain('unknown anchor scheme "line"')
    expect(result.message).toContain('region')
  })

  it('returns lost for a malformed anchor or a throwing resolver', async () => {
    const registry = createAnchorResolverRegistry([
      { scheme: 'boom', resolve: async () => { throw new Error('parse error') } },
    ])
    expect(await registry.resolve('no-scheme' as `${string}:${string}`, src)).toMatchObject({
      status: 'lost',
      message: expect.stringContaining('malformed anchor'),
    })
    expect(await registry.resolve('boom:x', src)).toMatchObject({
      status: 'lost',
      message: expect.stringContaining('parse error'),
    })
  })

  it('rejects duplicate or invalid schemes and supports unregistering', () => {
    const registry = createAnchorResolverRegistry()
    const off = registry.register(resolver('region', { status: 'exact' }))
    expect(() => registry.register(resolver('region', { status: 'exact' }))).toThrow('already registered')
    expect(() => registry.register(resolver('not valid', { status: 'exact' }))).toThrow('invalid anchor scheme')
    off()
    expect(registry.schemes()).toEqual([])
  })
})
