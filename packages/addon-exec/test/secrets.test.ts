// Credentials and compile-time execution (N-08, docs/architecture.md 10.6; WP-73b): with
// PRESMIUM_PROXY_SECRET and OPENAI_API_KEY set, the real `presmium build` runs Python and JavaScript
// that print every environment variable, and neither the names nor the values reach the
// recordings, the cache, the IR or the web form. The operator can pass a variable on
// (`settings.presmium.exec.passEnv`); the others stay out.
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import type { CodeNode, IRDocument } from '@presmium/kernel'
import { afterAll, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
// The decks live in the demo's ignored work directory, where the web form's packages resolve, each a
// git repository of its own, so its directory is the workspace root that holds its configuration.
const WORK = fileURLToPath(new URL('../../../examples/demo/.presmium', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

const SECRETS = { PRESMIUM_PROXY_SECRET: 'proxy-secret-7f3a9c', OPENAI_API_KEY: 'sk-fixture-openai-5d81e2' }

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

/** Every file under a directory, as text. */
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
  // The code ran and printed the environment it got.
  expect(recorded).toContain('PATH ')
  for (const [name, value] of Object.entries(SECRETS)) {
    expect(recorded).not.toContain(name)
    for (const where of [contents(join(dir, '.presmium/freeze')), readFileSync(join(dir, 'dist/ir.json'), 'utf8'), contents(join(dir, 'dist/web'))]) expect(where).not.toContain(value)
  }
})

it('passes on what the operator lists in settings.presmium.exec.passEnv, and nothing else', { timeout: 120_000 }, async () => {
  const { recorded } = await build('settings:\n  presmium.exec:\n    passEnv: [OPENAI_API_KEY]\n')
  expect(recorded).toContain(`OPENAI_API_KEY ${SECRETS.OPENAI_API_KEY}`)
  expect(recorded).not.toContain('PRESMIUM_PROXY_SECRET')
  expect(recorded).not.toContain(SECRETS.PRESMIUM_PROXY_SECRET)
})
