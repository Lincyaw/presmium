import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'

it('the CLI rejects a Markdown result that ends before it starts, with a source diagnostic', async () => {
  const root = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium', import.meta.url))
  mkdirSync(root, { recursive: true })
  const dir = mkdtempSync(join(root, 'invalid-step-range-'))
  try {
    writeFileSync(join(dir, 'lecture.md'), '# Results\n\n:::{slide}\n:at: 2\n:until: 1\nx = 1\n:::\n')
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../../cli/bin/presmium.mjs', import.meta.url)), 'check', dir], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stdout + result.stderr).toMatch(/lecture.md:3[^\n]*error[^\n]*until/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
