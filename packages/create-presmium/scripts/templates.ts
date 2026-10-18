#!/usr/bin/env node
// Copies each template from its source in the repository into templates/ (src/templates.ts): the
// package's `prepack`, so `pnpm pack`, `pnpm publish` and scripts/consumer.ts pack the templates as
// they are; `pnpm --filter create-presmium templates` runs it alone (create-presmium run from this
// checkout reads templates/ too). Packs may run at once (the consumer install and create-presmium's
// test): a file is written beside the package's files, outside templates/, then renamed into place,
// and one already equal is left alone.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { storedPath, TEMPLATE_SOURCES, templateFiles, TEMPLATES } from '../src/templates.ts'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const temporary = fileURLToPath(new URL(`../.template-${process.pid}.tmp`, import.meta.url))

for (const [name, source] of Object.entries(TEMPLATE_SOURCES)) {
  const from = join(root, source)
  if (!statSync(from, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`${source} is missing: create-presmium is packed in the Presmium repository`)
  const wanted = new Map(templateFiles(from).map(path => [storedPath(path), join(from, path)]))
  const dir = join(TEMPLATES, name)
  for (const path of existsSync(dir) ? templateFiles(dir) : []) {
    if (!wanted.has(path)) rmSync(join(dir, path), { force: true })
  }
  for (const [path, file] of wanted) {
    const target = join(dir, path)
    const content = readFileSync(file)
    if (existsSync(target) && readFileSync(target).equals(content)) continue
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(temporary, content)
    renameSync(temporary, target)
  }
}
// Silent: `pnpm pack --json` (scripts/consumer.ts) prints the prepack's output with its JSON.
