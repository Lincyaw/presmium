import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { ROOT } from './serve-helpers.ts'

const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-scripts-'))
  dirs.push(dir)
  return dir
}

function write(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

function check(root: string, script: string): { code: number | null, output: string } {
  const result = spawnSync(process.execPath, [join(root, 'scripts', script)], { encoding: 'utf8' })
  return { code: result.status, output: `${result.stdout}${result.stderr}` }
}

it('the layering check names the server and MCP modules that import browser packages, and IR runtime code that imports Slidev', () => {
  const root = scratch()
  cpSync(join(ROOT, 'scripts/check-layering.mjs'), join(root, 'scripts/check-layering.mjs'))
  write(join(root, 'packages/mcp/src/probe.ts'), `import { createViewer } from '@presmium/viewer'\nimport { useServer } from '@presmium/host'\n`)
  write(join(root, 'packages/server/src/probe.ts'), `export { webRenderer } from '@presmium/web/node'\n`)
  write(join(root, 'packages/viewer/src/probe.ts'), `import { useNav } from '@slidev/client'\n`)
  write(join(root, 'packages/kernel/src/probe.ts'), `import { copyPublished } from './node/index.ts'\n`)
  write(join(root, 'packages/kernel/src/node/index.ts'), `import { cpSync } from 'node:fs'\n`)
  const { code, output } = check(root, 'check-layering.mjs')
  expect(code).toBe(1)
  expect(output).toContain('packages/mcp/src/probe.ts: @presmium/viewer  (node packages are framework-free)')
  expect(output).toContain('packages/mcp/src/probe.ts: @presmium/host  (node packages are framework-free)')
  expect(output).toContain('packages/server/src/probe.ts: @presmium/web/node  (node packages are framework-free)')
  expect(output).toContain('packages/viewer/src/probe.ts: @slidev/client  (IR runtime is form-neutral)')
  expect(output).toContain('packages/kernel/src/probe.ts: ./node/index.ts  (kernel is framework-free)')
  expect(output).not.toContain('packages/kernel/src/node/index.ts')
})

function skills(change: (skills: string) => void): { code: number | null, output: string } {
  const root = scratch()
  cpSync(join(ROOT, 'scripts/check-skills.mjs'), join(root, 'scripts/check-skills.mjs'))
  cpSync(join(ROOT, '.agents/skills'), join(root, '.agents/skills'), { recursive: true })
  mkdirSync(join(root, '.claude'))
  symlinkSync('../.agents/skills', join(root, '.claude/skills'))
  writeFileSync(join(root, 'CLAUDE.md'), readFileSync(join(ROOT, 'CLAUDE.md')))
  symlinkSync('CLAUDE.md', join(root, 'AGENTS.md'))
  symlinkSync(join(ROOT, 'packages'), join(root, 'packages'))
  change(join(root, '.agents/skills'))
  return check(root, 'check-skills.mjs')
}

it('the skill check fails on an unknown command, an unknown option and a directive whose section is gone, naming each', () => {
  const develop = (dir: string) => join(dir, 'presmium-develop/SKILL.md')
  const append = (file: string, text: string) => writeFileSync(file, `${readFileSync(file, 'utf8')}\n${text}\n`)

  const command = skills(dir => append(develop(dir), '先运行 `presmium frobnicate` 再说。'))
  expect(command.code).toBe(1)
  expect(command.output).toContain('"presmium frobnicate" is not a CLI command')

  const option = skills(dir => append(develop(dir), '构建时加上 `presmium build --frobnicate`。'))
  expect(option.code).toBe(1)
  expect(option.output).toContain('"presmium build" has no option --frobnicate')

  const directive = skills((dir) => {
    const file = join(dir, 'presmium-author/references/directives.md')
    writeFileSync(file, readFileSync(file, 'utf8').replace('### `{quiz}`', '### `{quizz}`'))
  })
  expect(directive.code).toBe(1)
  expect(directive.output).toMatch(/has no section for \{quiz\} \(declared by @presmium\/slidev-addon-classroom\)/)

  expect(skills(() => {}).code).toBe(0)
}, 120_000)
