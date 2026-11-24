import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIXTURES, presmium, remove, workspace } from './helpers.ts'

function searchIndex(site: string): string {
  return readFileSync(join(site, 'search.json'), 'utf8')
}

describe('presmium build of a workspace', () => {
  let dir: string
  beforeAll(() => {
    dir = workspace('site', join(FIXTURES, 'site'))
  })
  afterAll(() => remove(dir))

  it('builds only the one document in its directory', async () => {
    const built = await presmium(join(dir, 'beta'), ['build', '--to', 'web'])
    expect(built.code, built.stderr).toBe(0)
    expect(readFileSync(join(dir, 'beta/dist/web/index.html'), 'utf8')).toContain('乙文档讲 quokkaland')
    expect(existsSync(join(dir, 'beta/dist/ir.json'))).toBe(true)
    expect(existsSync(join(dir, 'alpha/dist'))).toBe(false)
  }, 300_000)
})
