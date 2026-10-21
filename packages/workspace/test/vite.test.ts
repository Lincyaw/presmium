import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { cleanEnv, FIXTURES, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'

it('serves each document with its resolved Vite contribution and reloads that document\'s configuration after saving', async () => {
  const dir = workspace('site-vite', join(FIXTURES, 'site'))
  const process = presmiumProcess(dir, ['serve', '--port', '0'], cleanEnv({ XDG_CACHE_HOME: join(dir, '.cache'), XDG_STATE_HOME: join(dir, '.state') }))
  try {
    const url = (await waitFor(process, /^serve {2}(http:\/\/\S+)/m))[1]!
    const message = async (document: string) => (await raw(`${url}/${document}/fixture-vite`)).text
    expect(await message('alpha')).toBe('alpha-vite')
    expect(await message('beta')).toBe('beta-vite')
    const source = join(dir, 'alpha/lecture.md')
    writeFileSync(source, readFileSync(source, 'utf8').replace('alpha-vite', 'updated-vite'))
    await expect.poll(async () => {
      try {
        return await message('alpha')
      } catch (error) {
        return String(error)
      }
    }, { timeout: 60_000, interval: 250 }).toBe('updated-vite')
    expect(await message('beta')).toBe('beta-vite')
  } finally {
    await process.stop()
    remove(dir)
  }
}, 300_000)
