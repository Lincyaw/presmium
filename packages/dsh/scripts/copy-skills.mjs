#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const pkg = fileURLToPath(new URL('..', import.meta.url))
const source = join(pkg, '..', '..', '.agents', 'skills')
const copy = join(pkg, 'skills')
const { presmium } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'))

// A skill's gallery is built in place (presmium-animate): its dependencies and build output stay out of the copy.
const LEFT_OUT = new Set(['node_modules', 'dist', '.presmium'])
const kept = path => !path.split(sep).some(part => LEFT_OUT.has(part))

function files(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile()).map(entry => relative(dir, join(entry.parentPath, entry.name))).filter(kept).sort()
}

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
  cpSync(join(source, skill), join(copy, skill), { recursive: true, filter: from => kept(relative(join(source, skill), from)) })
}
