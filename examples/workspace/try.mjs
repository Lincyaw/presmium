#!/usr/bin/env node
// Makes a copy of the example workspace that is a git repository of its own, as `presmium serve`
// expects a workspace to be: the root of its repository, where the operator's plugins are installed
// and where document operations and accepted edits are committed (README.md).
//
//   node examples/workspace/try.mjs [dir]      (default: ~/presmium-example-workspace)
//
// The copy holds the workspace configuration and the two documents; the sample repository that the
// BPE lecture's code references name, at the same path (examples/sample-repo), with the commits
// their pins name (fetched from this checkout, shallow); and a link to this directory's
// node_modules, where `pnpm install` put the plugins. Then: presmium serve <dir>
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const target = resolve(process.argv[2] ?? join(homedir(), 'presmium-example-workspace'))
const git = (args, cwd) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
const REPO = git(['rev-parse', '--show-toplevel'], HERE)

if (!existsSync(join(HERE, 'node_modules/@presmium/cli'))) {
  console.error('the plugins are not installed: run pnpm install at the root of the Presmium repository first')
  process.exit(1)
}
if (existsSync(target) && readdirSync(target).length > 0) {
  console.error(`${target} exists and is not empty: name another directory`)
  process.exit(1)
}

// The workspace, without what is generated or installed.
const skipped = new Set(['node_modules', 'dist'])
for (const name of ['presmium.workspace.yaml', 'bpe', 'glance']) {
  cpSync(join(HERE, name), join(target, name), {
    recursive: true,
    filter: source => !skipped.has(source.split('/').at(-1)) && !/\/\.presmium\/(?!freeze|anchors\.lock\.json)[^/]+/.test(source.slice(HERE.length)),
  })
}
cpSync(join(REPO, 'examples/sample-repo'), join(target, 'examples/sample-repo'), { recursive: true })
symlinkSync(join(HERE, 'node_modules'), join(target, 'node_modules'), 'junction')
writeFileSync(join(target, '.gitignore'), [
  'node_modules',
  'dist/',
  '# Deck working directories: only these files of .presmium/ belong to a document.',
  '**/.presmium/*',
  '!**/.presmium/freeze/',
  '!**/.presmium/anchors.lock.json',
  '!**/.presmium/drawings/',
  '!**/.presmium/assets/',
  '!**/.presmium/speech/',
  '!**/.presmium/speech.lock.json',
  '',
].join('\n'))

git(['init', '-q', '-b', 'main'], target)
// The commits the BPE lecture's `:pin:` and `:variants:` name, each kept by a ref of its own.
const pages = readdirSync(join(target, 'bpe/pages')).map(file => readFileSync(join(target, 'bpe/pages', file), 'utf8')).join('\n')
const pins = new Set([...pages.matchAll(/^:(?:pin|variants):(.+)$/gm)].flatMap(([, list]) => list.split(',').map(pin => pin.trim())))
for (const pin of pins) {
  const commit = git(['rev-parse', '--verify', `${pin}^{commit}`], REPO)
  git(['fetch', '-q', '--no-tags', '--depth=1', REPO, `${commit}:refs/presmium/pins/${pin}`], target)
}
let email = ''
try {
  email = git(['config', 'user.email'], target)
} catch {
  // No identity configured: the first commit gets one of its own.
}
const identity = email ? [] : ['-c', 'user.name=Presmium example', '-c', 'user.email=example@presmium.invalid']
git(['add', '-A'], target)
git([...identity, '-c', 'commit.gpgSign=false', 'commit', '-q', '-m', '示例工作区：BPE 分词与分词速览'], target)

console.log(`the example workspace is in ${target}; serve it with:
  presmium serve ${target}`)
