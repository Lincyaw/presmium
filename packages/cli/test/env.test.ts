import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CodeNode, IRDocument } from '@presmium/kernel'
import { afterAll, expect, it } from 'vitest'
import { presmium } from './helpers.ts'

const EXEC_LOCAL = fileURLToPath(new URL('../../addon-exec-local', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

function deck(head: string, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-env-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'lecture.md'), `---\ntitle: 环境\nplugins:\n  - ${EXEC_LOCAL}\nexecute:\n  environments:\n    box: { kind: devcontainer }\n${head}---\n\n## 代码\n\n${body}`)
  return dir
}

const code = (env: string) => `\`\`\`{code} python\n:run: live\n:env: ${env}\nprint("在环境中")\n\`\`\`\n`

it('code that names a declared environment runs with its executor, presmium.env.<name>', async () => {
  const dir = deck('', code('box'))
  const result = await presmium(dir, ['ir'])
  expect(result.code, result.stdout + result.stderr).toBe(0)
  const doc = JSON.parse(result.stdout) as IRDocument
  expect(doc.config.execute?.environments).toEqual({ box: { kind: 'devcontainer' } })
  const node = doc.sections[0]!.blocks.find(block => block.node.type === 'code')!.node as CodeNode
  expect(node.run?.executor).toBe('presmium.env.box')
})

it('check fails on code that names an undeclared environment, on its line; it warns of a credential in the headmatter; --env connects', async () => {
  const dir = deck('token: sk-proj-abcdefghijklmnopqrstuvwx\n', code('nowhere'))
  const result = await presmium(dir, ['check', '--json'])
  expect(result.code, result.stdout + result.stderr).toBe(1)
  const { findings } = JSON.parse(result.stdout) as { findings: { checkId: string, severity: string, message: string, source: { file: string, line: number } }[] }
  const lecture = join(dir, 'lecture.md')
  expect(findings).toContainEqual(expect.objectContaining({ checkId: 'presmium.execute', severity: 'error', source: { file: lecture, line: 13 } }))
  expect(findings.find(f => f.source.line === 13)?.message).toContain('nowhere')
  expect(findings).toContainEqual(expect.objectContaining({ checkId: 'presmium.secrets', severity: 'warning', source: { file: lecture, line: 8 } }))

  const probed = await presmium(dir, ['check', '--env'])
  expect(probed.stdout).toMatch(/lecture\.md:7 {2}error {2}environment "box" \(devcontainer\) is not reachable: no devcontainer definition/)
})

const EXEC_WASI = fileURLToPath(new URL('../../addon-exec-wasi', import.meta.url))

it('check says on a block\'s line that its environment does not run its language, the default environment too (F-45)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-env-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'lecture.md'), `---\ntitle: 环境的语言\nplugins:\n  - ${EXEC_WASI}\nexecute:\n  env: wasm\n  environments:\n    wasm: { kind: wasi, languages: [c] }\n---\n\n## 代码\n\n\`\`\`{code} ruby\n:run:\nputs 1\n\`\`\`\n\n\`\`\`{code} python\n:run:\n:env: wasm\nprint(1)\n\`\`\`\n`)
  const result = await presmium(dir, ['check', '--json'])
  expect(result.code, result.stdout + result.stderr).toBe(1)
  const { findings } = JSON.parse(result.stdout) as { findings: { checkId: string, severity: string, message: string, hint?: string, source: { line: number } }[] }
  const execute = findings.filter(f => f.checkId === 'presmium.execute')
  expect(execute).toEqual([
    expect.objectContaining({ severity: 'error', message: 'environment "wasm" (wasi) runs c, not ruby', source: expect.objectContaining({ line: 13 }), hint: expect.stringContaining('execute.env') }),
    expect.objectContaining({ severity: 'error', message: 'environment "wasm" (wasi) runs c, not python', source: expect.objectContaining({ line: 18 }) }),
  ])
})
