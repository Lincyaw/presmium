import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CodeNode, IRDocument } from '@lincyaw/kernel'
import { afterAll, expect, it } from 'vitest'
import { build, Compiler } from '../src/index.ts'

const CLI = fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

function fixture(plugin: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-plugin-contract-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'plugin'))
  writeFileSync(join(dir, 'plugin/package.json'), JSON.stringify({ name: 'fixture-contract', private: true, type: 'module', exports: { './presmium': './plugin.mjs' } }))
  writeFileSync(join(dir, 'plugin/plugin.mjs'), plugin)
  return dir
}

it('a rebuilt IR uses services created with the current configuration and language, and keeps earlier compilations intact', async () => {
  const dir = fixture(`
const token = { id: 'fixture.snapshot' }
export default {
  id: 'fixture.contract',
  services: ctx => [[token, { value: ctx.config.value, lang: ctx.lang }]],
  passes: [{ name: 'snapshot', run(doc, ctx) { doc.meta.service = ctx.service(token) } }],
}
`)
  const source = (value: string, lang: string) => `---\nplugins: ['./plugin']\nlang: ${lang}\npresmium:\n  fixture.contract: { value: ${value} }\n---\n# Service\n`
  const entry = join(dir, 'lecture.md')
  writeFileSync(entry, source('first', 'zh-CN'))
  const compiler = new Compiler(entry, { settings: {} })
  const first = await compiler.compile()
  writeFileSync(entry, source('second', 'en'))
  const second = await compiler.compile()
  const report = await build(second, { to: [], outDir: join(dir, 'dist') })
  expect(report.findings.filter(finding => finding.severity === 'error')).toEqual([])
  expect(JSON.parse(readFileSync(report.ir, 'utf8')).meta.service).toEqual({ value: 'second', lang: 'en' })
  expect(first.service({ id: 'fixture.snapshot' })).toEqual({ value: 'first', lang: 'zh-CN' })
})

it('re-records a cached MIME output whose blob disappeared, and reports no recording when its executor is unavailable', () => {
  const dir = fixture(`
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const log = fileURLToPath(new URL('../runs.log', import.meta.url))
export default {
  id: 'fixture.contract',
  executors: [{
    id: 'fixture.image', supports: lang => lang === 'python', fingerprint: () => 'fixture',
    async run() {
      appendFileSync(log, 'run\\n')
      return { ok: true, stdout: '', stderr: '', exitCode: 0, durationMs: 0, timedOut: false, source: 'live', executorId: 'fixture.image', outputs: [{ output_type: 'display_data', data: { 'image/png': 'A'.repeat(5000) } }] }
    },
  }],
}
`)
  const source = (plugins: boolean) => `---\nplugins: ${plugins ? "['./plugin']" : '[]'}\n---\n# Image\n\n\`\`\`{code} python\n:run:\nimage()\n\`\`\`\n`
  const entry = join(dir, 'lecture.md')
  writeFileSync(entry, source(true))
  const compile = (): IRDocument => {
    const result = spawnSync(process.execPath, [CLI, 'ir', entry], { encoding: 'utf8' })
    expect(result.status, result.stdout + result.stderr).toBe(0)
    return JSON.parse(result.stdout)
  }
  const image = (doc: IRDocument) => (doc.sections.flatMap(section => section.blocks).find(block => block.node.type === 'code')!.node as CodeNode).outputs
  expect(image(compile())?.[0]?.outputs?.[0]).toMatchObject({ data: { 'image/png': 'A'.repeat(5000) } })
  const blobs = join(dir, '.presmium/freeze/blobs')
  const removeBlob = () => readdirSync(blobs).forEach(blob => rmSync(join(blobs, blob)))
  removeBlob()
  expect(image(compile())?.[0]?.outputs?.[0]).toMatchObject({ data: { 'image/png': 'A'.repeat(5000) } })
  expect(readFileSync(join(dir, 'runs.log'), 'utf8')).toBe('run\nrun\n')
  removeBlob()
  writeFileSync(entry, source(false))
  const unavailable = compile()
  expect(image(unavailable)).toBeUndefined()
  expect(unavailable.diagnostics).toContainEqual(expect.objectContaining({ message: expect.stringContaining('no recorded output') }))
})
