#!/usr/bin/env node
// Before packing (`prepack`): copies the skills this package registers (package.json `presmium.skills`) from
// their one source, the repository's .agents/skills, into skills/; after packing (`postpack`, `--remove`)
// removes the copy. The copy is never in the repository; scripts/check-skills.mjs checks that every skill
// named is in the source (docs/design-dsh.md 6.1). It prints nothing: `pnpm pack --json` prints its answer on stdout.
import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = fileURLToPath(new URL('..', import.meta.url))
const source = join(pkg, '..', '..', '.agents', 'skills')
const { presmium } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'))
rmSync(join(pkg, 'skills'), { recursive: true, force: true })
if (process.argv.includes('--remove')) process.exit(0)
for (const skill of presmium.skills) {
  if (!existsSync(join(source, skill, 'SKILL.md'))) throw new Error(`the skill ${skill} is not in ${source}`)
  cpSync(join(source, skill), join(pkg, 'skills', skill), { recursive: true })
}
