import { describe, expect, it } from 'vitest'
import { AnchorLock } from '../src/index.ts'
import type { Resolution } from '../src/index.ts'

const location = { file: 'src/a.py', startLine: 4, endLine: 6, text: 'x' }

describe('AnchorLock', () => {
  it('treats missing or blank text as an empty lock', () => {
    expect(AnchorLock.parse(undefined).toJSON()).toEqual({ version: 1, anchors: {} })
    expect(AnchorLock.parse(' \n').size).toBe(0)
  })

  it('rejects invalid content', () => {
    expect(() => AnchorLock.parse('{')).toThrow('invalid anchor lock')
    expect(() => AnchorLock.parse('{"version":2,"anchors":{}}')).toThrow('"version": 1')
    expect(() => AnchorLock.parse('{"version":1,"anchors":{"r:x":{"fingerprint":"f","file":"a","startLine":0}}}'))
      .toThrow('bad record for "r:x"')
  })

  it('records only renderable resolutions', () => {
    const lock = AnchorLock.empty()
    const exact: Resolution = { status: 'exact', location, fingerprint: 'f1' }
    expect(lock.record('region:a#x', exact)).toBe(true)
    expect(lock.get('region:a#x')).toEqual({ fingerprint: 'f1', file: 'src/a.py', startLine: 4 })

    const fuzzy: Resolution = { status: 'fuzzy', location: { ...location, startLine: 9 }, fingerprint: 'f2' }
    expect(lock.record('region:a#x', fuzzy)).toBe(false)
    expect(lock.record('region:a#y', { status: 'lost' })).toBe(false)
    expect(lock.get('region:a#x')?.fingerprint).toBe('f1')
    expect(lock.get('region:a#y')).toBeUndefined()

    expect(lock.record('region:a#x', { status: 'moved', location: { ...location, startLine: 7 }, fingerprint: 'f1' })).toBe(true)
    expect(lock.get('region:a#x')?.startLine).toBe(7)
  })

  it('serializes deterministically and round-trips', () => {
    const text = '{"anchors":{"z:b":{"startLine":2,"file":"b","fingerprint":"2"},"a:a":{"file":"a","fingerprint":"1","startLine":1}},"version":1}'
    const serialized = AnchorLock.parse(text).serialize()
    expect(serialized).toBe(`{
  "version": 1,
  "anchors": {
    "a:a": {
      "fingerprint": "1",
      "file": "a",
      "startLine": 1
    },
    "z:b": {
      "fingerprint": "2",
      "file": "b",
      "startLine": 2
    }
  }
}
`)
    expect(AnchorLock.parse(serialized).serialize()).toBe(serialized)
    expect(AnchorLock.from(JSON.parse(serialized)).toJSON()).toEqual(JSON.parse(serialized))
  })

  it('drops anchors that are no longer used', () => {
    const lock = AnchorLock.empty()
    lock.set('a:1', { fingerprint: 'f', file: 'a', startLine: 1 })
    lock.set('a:2', { fingerprint: 'f', file: 'a', startLine: 2 })
    lock.retain(['a:2', 'a:3'])
    expect(Object.keys(lock.toJSON().anchors)).toEqual(['a:2'])
  })
})
