import { describe, expect, it } from 'vitest'
import { fingerprint, fnv1a64, normalizeWhitespace } from '../src/index.ts'

const original = `def add(a, b):
    return a + b
`

describe('normalizeWhitespace', () => {
  it('drops whitespace around punctuation and collapses it between words', () => {
    expect(normalizeWhitespace(original)).toBe('def add(a,b):return a+b')
    expect(normalizeWhitespace('  x  =  [ 1 ,2 ]\r\n')).toBe('x=[1,2]')
    expect(normalizeWhitespace('名字 = "值"')).toBe('名字="值"')
  })
})

describe('fingerprint', () => {
  it('matches the FNV-1a 64-bit reference values', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325')
    expect(fnv1a64('a')).toBe('af63dc4c8601ec8c')
    expect(fnv1a64('foobar')).toBe('85944171f73967e8')
  })

  it('ignores blank lines, indentation and formatting', () => {
    const reformatted = `def add( a,b ):

        return a+b`
    expect(fingerprint(reformatted)).toBe(fingerprint(original))
    expect(fingerprint(original.replace(/\n/g, '\r\n'))).toBe(fingerprint(original))
  })

  it('changes when tokens change', () => {
    expect(fingerprint(original.replace('a + b', 'a - b'))).not.toBe(fingerprint(original))
    expect(fingerprint('return x')).not.toBe(fingerprint('returnx'))
  })

  it('is 16 hex digits', () => {
    expect(fingerprint(original)).toMatch(/^[0-9a-f]{16}$/)
  })
})
