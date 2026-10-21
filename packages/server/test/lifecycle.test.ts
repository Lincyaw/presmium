import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Compiler } from '@lincyaw/compiler'
import { expect, it } from 'vitest'
import { servedDocument, startServer } from '../src/index.ts'
import { cleanEnv, FIXTURES, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'

const FIXTURE = join(FIXTURES, 'lifecycle')

it('waits for a document\'s asynchronous resource release before remounting and before the server closes', async () => {
  const dir = workspace('server-resource', { '.': FIXTURE })
  const compiler = new Compiler(join(dir, 'lecture.md'))
  const server = await startServer({ mode: 'dev', document: async () => servedDocument(await compiler.compile()) })
  const lock = join(dir, 'resource.lock')
  let releasing: Promise<void> | undefined
  try {
    const value = () => raw(`${server.url}/__presmium/fixture.lifecycle/value`)
    expect((await value()).json()).toEqual({ implementation: 'first', value: 'first configuration' })
    const entry = join(dir, 'lecture.md')
    writeFileSync(entry, readFileSync(entry, 'utf8').replace('first configuration', 'saved configuration'))
    releasing = server.unmount('', { preserveFocus: true })
    const response = await value()
    expect(response.status, response.text).toBe(200)
    expect(response.json()).toEqual({ implementation: 'first', value: 'saved configuration' })
    await releasing
    releasing = server.unmount('')
    await server.close()
    expect(existsSync(lock)).toBe(false)
  } finally {
    await releasing
    await server.close()
    remove(dir)
  }
})

it('refreshes the HTTP contribution when a saved plugin path selects a different implementation with the same ID', async () => {
  const dir = workspace('server-implementation', { doc: FIXTURE })
  writeFileSync(join(dir, 'presmium.workspace.yaml'), 'title: Implementations\ndocuments: [doc/lecture.md]\n')
  const process = presmiumProcess(dir, ['serve', '--port', '0'], cleanEnv({ XDG_CACHE_HOME: join(dir, '.cache'), XDG_STATE_HOME: join(dir, '.state') }))
  try {
    const url = (await waitFor(process, /^serve {2}(http\S+)$/m))[1]!
    const value = () => raw(`${url}/__presmium/fixture.lifecycle/value`, { headers: { 'Presmium-Document': 'doc' } }).then(response => response.json())
    expect(await value()).toEqual({ implementation: 'first', value: 'first configuration' })
    const entry = join(dir, 'doc/lecture.md')
    writeFileSync(entry, readFileSync(entry, 'utf8').replace("'./plugin'", "'./other'"))
    await expect.poll(value, { timeout: 30_000 }).toEqual({ implementation: 'second', value: 'first configuration' })
  } finally {
    await process.stop()
    remove(dir)
  }
}, 60_000)
