// Named environments (P-100, WP-73b), with the real `presmium ir` and `presmium check`: a deck
// declares `box: { kind: devcontainer }`, which the local environment plugin provides; code that
// names it runs with its executor, code that names an undeclared environment is an error on its
// line, and a headmatter value that looks like a credential is a warning. The code runs only live,
// so no container starts.
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

/** A deck outside git (its directory is the workspace root), its headmatter and body given. */
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
  // The code block starts on line 13, after the headmatter (the token on line 8) and the heading.
  expect(findings).toContainEqual(expect.objectContaining({ checkId: 'presmium.execute', severity: 'error', source: { file: lecture, line: 13 } }))
  expect(findings.find(f => f.source.line === 13)?.message).toContain('nowhere')
  expect(findings).toContainEqual(expect.objectContaining({ checkId: 'presmium.secrets', severity: 'warning', source: { file: lecture, line: 8 } }))

  // --env asks the provider: there is no devcontainer definition here.
  const probed = await presmium(dir, ['check', '--env'])
  expect(probed.stdout).toMatch(/lecture\.md:7 {2}error {2}environment "box" \(devcontainer\) is not reachable: no devcontainer definition/)
})
