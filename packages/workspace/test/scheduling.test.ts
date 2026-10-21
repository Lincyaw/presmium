import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { cleanEnv, FIXTURES, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'

it('compiles only the requested document and publishes the latest edit when saves arrive during compilation', async () => {
  const dir = workspace('compile-scheduling', join(FIXTURES, 'service'))
  writeFileSync(join(dir, 'presmium.workspace.yaml'), "title: Scheduling\ndocuments: ['*/lecture.md']\n")
  mkdirSync(join(dir, 'probe'))
  writeFileSync(join(dir, 'probe/package.json'), JSON.stringify({ name: 'fixture-scheduling', private: true, type: 'module', exports: { './presmium': './plugin.mjs' } }))
  writeFileSync(join(dir, 'probe/plugin.mjs'), `
import { appendFileSync } from 'node:fs'
export default { id: 'fixture.scheduling', passes: [{ name: 'observe', async run(doc) {
  appendFileSync(${JSON.stringify(join(dir, 'compiled.txt'))}, doc.meta.title + '\\n')
  await new Promise(resolve => setTimeout(resolve, 80))
}}] }
`)
  const source = (title: string, text: string) => `---\ntitle: ${title}\nplugins: ['../probe']\n---\n# ${title}\n\n${text}\n`
  const entry = join(dir, 'talk/lecture.md')
  writeFileSync(entry, source('Talk', 'initial'))
  writeFileSync(join(dir, 'fresh/lecture.md'), source('Unopened', 'not requested'))
  const child = presmiumProcess(dir, ['serve', '--port', '0'], cleanEnv({ XDG_CACHE_HOME: join(dir, '.cache'), XDG_STATE_HOME: join(dir, '.state'), GOMAXPROCS: '1', RAYON_NUM_THREADS: '1' }))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const url = (await waitFor(child, /^serve {2}(http\S+)$/m))[1]!
    expect(existsSync(join(dir, 'compiled.txt'))).toBe(false)
    const first = await raw(`${url}/__presmium/presmium.workspace/ir?document=talk`)
    expect(first.status).toBe(200)
    const response = await fetch(`${url}/__presmium/presmium.workspace/ir/events?document=talk`, { signal: controller.signal })
    expect(response.status).toBe(200)
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let received = ''
    while (!received.includes('\n\n')) received += decoder.decode((await reader.read()).value, { stream: true })
    writeFileSync(entry, source('Talk', 'intermediate edit'))
    await new Promise(resolve => setTimeout(resolve, 35))
    writeFileSync(entry, source('Talk', 'latest edit'))
    received = ''
    while (!received.includes('\n\n')) received += decoder.decode((await reader.read()).value, { stream: true })
    const next = await raw(`${url}/__presmium/presmium.workspace/ir?document=talk`)
    expect(next.status).toBe(200)
    expect(next.text).toContain('latest edit')
    expect(next.text).not.toContain('intermediate edit')
    expect(readFileSync(join(dir, 'compiled.txt'), 'utf8')).not.toContain('Unopened')
  } finally {
    clearTimeout(timeout)
    controller.abort()
    await child.stop()
    remove(dir)
  }
}, 120_000)

it('leaves a single-document project uncompiled until it is requested', async () => {
  const dir = workspace('single-lazy-compile', join(FIXTURES, 'service'))
  const marker = join(dir, 'compiled.txt')
  writeFileSync(join(dir, 'presmium.workspace.yaml'), 'title: Single\n')
  mkdirSync(join(dir, 'probe'))
  writeFileSync(join(dir, 'probe/package.json'), JSON.stringify({ name: 'fixture-single', private: true, type: 'module', exports: { './presmium': './plugin.mjs' } }))
  writeFileSync(join(dir, 'probe/plugin.mjs'), `import { writeFileSync } from 'node:fs'; export default { id: 'fixture.single', passes: [{ name: 'observe', run() { writeFileSync(${JSON.stringify(marker)}, 'compiled') } }] }`)
  writeFileSync(join(dir, 'lecture.md'), "---\ntitle: Single\nplugins: ['./probe']\n---\n# Single\n")
  const child = presmiumProcess(dir, ['serve', '--port', '0'], cleanEnv({ XDG_CACHE_HOME: join(dir, '.cache'), XDG_STATE_HOME: join(dir, '.state') }))
  try {
    const url = (await waitFor(child, /^serve {2}(http\S+)$/m))[1]!
    expect(existsSync(marker)).toBe(false)
    const ir = await raw(`${url}/__presmium/presmium.workspace/ir`)
    expect(ir.status, ir.text).toBe(200)
    expect(existsSync(marker)).toBe(true)
  } finally {
    await child.stop()
    remove(dir)
  }
}, 120_000)
