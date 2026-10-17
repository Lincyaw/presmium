#!/usr/bin/env node
// The workspace's BPE document (bpe/) is the demo lecture (examples/demo) with the assistant added to
// its plugins, for the edit mode of `presmium serve`: its source, its execution recordings and its
// anchor lock. This copies it from the demo; with --check it changes nothing, lists the files that
// differ and exits with 1 when there are any (e2e/demo-workspace.spec.ts runs it so).
//
//   node examples/workspace/sync.mjs [--check]
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEMO = join(HERE, '../demo')
const BPE = join(HERE, 'bpe')
const check = process.argv.includes('--check')

/** The plugin line after which the copy lists the assistant. */
const AFTER = "  - '@presmium/slidev-addon-speech'\n"
const ASSISTANT = "  - '@presmium/slidev-addon-assistant'   # 编辑模式中的“AI 修改”与“提问”（presmium serve）\n"

/** Files of `dir` (recursively), relative to it. */
function files(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true }).filter(entry => entry.isFile())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)))
}

/** What bpe/ holds: each file's path and its content. */
function wanted() {
  const lecture = readFileSync(join(DEMO, 'lecture.md'), 'utf8')
  if (!lecture.includes(AFTER)) throw new Error(`examples/demo/lecture.md no longer lists ${AFTER.trim()}; update sync.mjs`)
  const out = new Map([['lecture.md', lecture.replace(AFTER, AFTER + ASSISTANT)]])
  for (const path of [...files(join(DEMO, 'pages')).map(f => join('pages', f)), ...files(join(DEMO, '.presmium/freeze')).map(f => join('.presmium/freeze', f)), '.presmium/anchors.lock.json']) {
    out.set(path, readFileSync(join(DEMO, path)))
  }
  return out
}

const want = wanted()
const differ = []
for (const [path, content] of want) {
  const file = join(BPE, path)
  const same = existsSync(file) && Buffer.compare(readFileSync(file), Buffer.from(content)) === 0
  if (same) continue
  differ.push(path)
  if (!check) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
}
// Pages and recordings the demo no longer has.
for (const path of [...files(join(BPE, 'pages')).map(f => join('pages', f)), ...files(join(BPE, '.presmium/freeze')).map(f => join('.presmium/freeze', f))]) {
  if (want.has(path)) continue
  differ.push(path)
  if (!check) rmSync(join(BPE, path))
}

if (check) {
  if (differ.length > 0) {
    console.error(`examples/workspace/bpe differs from examples/demo in: ${differ.join(', ')}\nrun: node examples/workspace/sync.mjs`)
    process.exit(1)
  }
  console.log('examples/workspace/bpe is the demo lecture')
} else {
  console.log(differ.length > 0 ? `updated ${differ.join(', ')}` : 'examples/workspace/bpe is the demo lecture')
}
