// The plugin as Presmium runs it: integration tests only, with the real `presmium` CLI on the
// example document (example/lecture.md), never a mock of Presmium or its frameworks. One or two
// cases for each thing the plugin promises: the directive and its fallback, the server route.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN, presmium } from '@presmium/cli/testing'
import { afterAll, expect, it } from 'vitest'
import { COMPONENT, PLUGIN_ID } from '../src/domain/index.ts'
import type { Waves } from '../src/domain/index.ts'

const EXAMPLE = fileURLToPath(new URL('../example', import.meta.url))
const out = mkdtempSync(join(tmpdir(), 'presmium-plugin-'))
afterAll(() => rmSync(out, { recursive: true, force: true }))

it('checks the example document with no problems', async () => {
  const { code, stdout, stderr } = await presmium(EXAMPLE, ['check'])
  expect(code, stdout + stderr).toBe(0)
  expect(stdout).toContain('no problems')
})

it('makes the directive its component, and its fallback the notebook\'s text', async () => {
  const { code, stdout, stderr } = await presmium(EXAMPLE, ['build', '--to', 'notebook', '--out', out])
  expect(code, stdout + stderr).toBe(0)
  const ir = JSON.parse(readFileSync(join(out, 'ir.json'), 'utf8')) as { sections: { id: string, blocks: { node: unknown }[] }[] }
  const section = ir.sections.find(s => s.id === 'greeting')
  expect(section?.blocks.map(block => block.node)).toContainEqual(expect.objectContaining({ type: 'component', plugin: PLUGIN_ID, name: COMPONENT, props: { name: 'reader' } }))
  // The document is in English (`lang: en`): so is the text the build writes.
  expect(readFileSync(join(out, 'notebook/lecture.ipynb'), 'utf8')).toContain('Hello, reader!')
})

it('counts the waves on its server route under presmium dev', async () => {
  // `--to notebook`: the Presmium server alone, without the web page's dev server.
  const { NODE_ENV: _test, ...env } = process.env
  const dev = spawn(process.execPath, [PRESMIUM_BIN, 'dev', '--to', 'notebook', '--out', join(out, 'dev')], { cwd: EXAMPLE, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = new Promise(resolve => dev.once('exit', resolve))
  try {
    const server = await new Promise<string>((resolve, reject) => {
      let output = ''
      const read = (chunk: Buffer) => {
        output += chunk
        const url = /^server {2}(http\S+)$/m.exec(output)?.[1]
        if (url) resolve(url)
      }
      dev.stdout.on('data', read)
      dev.stderr.on('data', read)
      dev.once('exit', code => reject(new Error(`presmium dev exited (${code}):\n${output}`)))
    })
    const waves = async (init?: RequestInit) => ((await (await fetch(`${server}/__presmium/${PLUGIN_ID}/waves`, init)).json()) as Waves).waves
    expect(await waves()).toBe(0)
    expect(await waves({ method: 'POST' })).toBe(1)
    expect(await waves({ method: 'POST' })).toBe(2)
    expect(await waves()).toBe(2)
  } finally {
    dev.kill('SIGTERM')
    await exited
  }
})
