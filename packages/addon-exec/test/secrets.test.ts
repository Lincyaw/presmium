import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import type { CodeNode, IRDocument } from '@presmium/kernel'
import { afterAll, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const WORK = fileURLToPath(new URL('../../../examples/demo/.presmium', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

const SECRETS = { PRESMIUM_MODEL_KEY: 'model-key-7f3a9c', OPENAI_API_KEY: 'sk-fixture-openai-5d81e2' }

const DECK = `---
title: 凭据
plugins:
  - ${ADDON}
---

## 环境变量

\`\`\`{code} python
:run:
import os
for name, value in sorted(os.environ.items()):
    print(name, value)
\`\`\`

\`\`\`{code} javascript
:run:
for (const [name, value] of Object.entries(process.env).sort()) console.log(name, value)
\`\`\`
`

function contents(dir: string): string {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).map(name => join(dir, name)).filter(path => statSync(path).isFile()).map(path => readFileSync(path, 'utf8')).join('\n')
}

async function build(workspace?: string): Promise<{ dir: string, recorded: string }> {
  mkdirSync(WORK, { recursive: true })
  const dir = mkdtempSync(join(WORK, 'test-secrets-'))
  dirs.push(dir)
  spawnSync('git', ['init', '-q'], { cwd: dir })
  writeFileSync(join(dir, '.gitignore'), '*\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: basename(dir).toLowerCase(), private: true, type: 'module' })}\n`)
  writeFileSync(join(dir, 'lecture.md'), DECK)
  if (workspace) writeFileSync(join(dir, 'presmium.workspace.yaml'), workspace)
  const result = await presmium(dir, ['build', '--to', 'web'], SECRETS)
  expect(result.code, result.stdout + result.stderr).toBe(0)
  const doc = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
  const recorded = doc.sections[0]!.blocks.map(block => (block.node as CodeNode).outputs?.[0]?.stdout ?? '').join('\n')
  return { dir, recorded }
}

it('keeps the build\'s credentials out of the code\'s environment, the recordings, the cache, the IR and the web form', { timeout: 120_000 }, async () => {
  const { dir, recorded } = await build()
  expect(recorded).toContain('PATH ')
  for (const [name, value] of Object.entries(SECRETS)) {
    expect(recorded).not.toContain(name)
    for (const where of [contents(join(dir, '.presmium/freeze')), readFileSync(join(dir, 'dist/ir.json'), 'utf8'), contents(join(dir, 'dist/web'))]) expect(where).not.toContain(value)
  }
})

it('passes on what the operator lists in settings.presmium.exec.passEnv, and nothing else', { timeout: 120_000 }, async () => {
  const { recorded } = await build('settings:\n  presmium.exec:\n    passEnv: [OPENAI_API_KEY]\n')
  expect(recorded).toContain(`OPENAI_API_KEY ${SECRETS.OPENAI_API_KEY}`)
  expect(recorded).not.toContain('PRESMIUM_MODEL_KEY')
  expect(recorded).not.toContain(SECRETS.PRESMIUM_MODEL_KEY)
})
