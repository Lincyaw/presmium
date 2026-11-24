import { expect, it } from 'vitest'
import { fixtures, presmium } from './helpers.ts'

const check = (cwd: string, ...args: string[]) => presmium(cwd, ['check', ...args])

it('exits 0 without errors, 1 with error findings and 2 on bad arguments', async () => {
  const dir = fixtures()
  expect((await check(dir, 'ok')).code).toBe(0)
  expect((await check(dir, 'broken')).code).toBe(1)
  expect((await check(dir, 'ok', '--bogus')).code).toBe(2)
  expect((await check(dir, 'no-such-deck')).code).toBe(2)
})
