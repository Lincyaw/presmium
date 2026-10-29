#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { infoOf, resourceFiles, REPOSITORY_SKILLS, SKILL_NAMES } from '../src/resources.ts'

const target = fileURLToPath(new URL('../skills/', import.meta.url))
mkdirSync(target, { recursive: true })
for (const name of SKILL_NAMES) {
  const source = join(REPOSITORY_SKILLS, name)
  const destination = join(target, name)
  const paths = resourceFiles(source)
  const same = existsSync(destination) && paths.join('\n') === resourceFiles(destination).join('\n')
    && paths.every(path => readFileSync(join(source, path)).equals(readFileSync(join(destination, path))))
  if (same) continue
  const staging = join(target, `.${name}-${process.pid}`)
  rmSync(staging, { recursive: true, force: true })
  try {
    for (const path of paths) {
      const file = join(staging, path)
      mkdirSync(dirname(file), { recursive: true })
      cpSync(join(source, path), file)
    }
    rmSync(destination, { recursive: true, force: true })
    renameSync(staging, destination)
  } finally { rmSync(staging, { recursive: true, force: true }) }
}
writeFileSync(join(target, 'index.json'), JSON.stringify(SKILL_NAMES.map(name => infoOf(name, join(target, name))), null, 2) + '\n')
