#!/usr/bin/env node
// Before packing (`prepack`): makes skills/ a copy of the skills this package registers (package.json
// `presmium.skills`), from their one source, the repository's .agents/skills. The copy is never in the
// repository (.gitignore) and stays after packing: the tests pack this package in several processes at once,
// and a copy one of them removed or rewrote while another packed it lost files. So a skill is copied again
// only when its copy differs from the source, and the directory of a skill no longer named is removed; in a
// checkout the bundle reads .agents/skills itself (src/node/skills.ts). scripts/check-skills.mjs checks that
// every skill named is in the source (docs/design-dsh.md 6.1). It prints nothing: `pnpm pack --json` prints
// its answer on stdout.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = fileURLToPath(new URL('..', import.meta.url))
const source = join(pkg, '..', '..', '.agents', 'skills')
const copy = join(pkg, 'skills')
const { presmium } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'))

/** The files under a directory, relative to it, sorted. */
function files(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => relative(dir, join(entry.parentPath, entry.name))).sort()
}

/** Whether `to` holds the same files as `from`, byte for byte. */
function same(from, to) {
  if (!existsSync(to)) return false
  const names = files(from)
  return names.join('\n') === files(to).join('\n') && names.every(name => readFileSync(join(from, name)).equals(readFileSync(join(to, name))))
}

mkdirSync(copy, { recursive: true })
for (const entry of readdirSync(copy)) {
  if (!presmium.skills.includes(entry)) rmSync(join(copy, entry), { recursive: true, force: true })
}
for (const skill of presmium.skills) {
  if (!existsSync(join(source, skill, 'SKILL.md'))) throw new Error(`the skill ${skill} is not in ${source}`)
  if (same(join(source, skill), join(copy, skill))) continue
  rmSync(join(copy, skill), { recursive: true, force: true })
  cpSync(join(source, skill), join(copy, skill), { recursive: true })
}
