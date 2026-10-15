import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const srcDir = join(import.meta.dirname, '../src')
const forbidden = /from\s+['"](vue|vitepress|@slidev\/[^'"]*|node:[^'"]*)['"]/g

describe('kernel layering', () => {
  it('stays framework-free and runtime-neutral', () => {
    const violations = readdirSync(srcDir, { recursive: true, encoding: 'utf8' })
      .filter(f => f.endsWith('.ts'))
      .flatMap(f => [...readFileSync(join(srcDir, f), 'utf8').matchAll(forbidden)].map(m => `${f}: ${m[1]}`))
    expect(violations).toEqual([])
  })
})
