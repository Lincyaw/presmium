// Prepares an editable copy of the example for the workbench (`pnpm studio`): the lectures, their animations and the
// synthesis cache of their narration, in a git repository of its own whose history is the workbench's versions.
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const target = resolve(process.argv[2] ?? '.presmium/example-workspace')
if (existsSync(target) && readdirSync(target).length) throw new Error(`${target} already exists and is not empty`)
// A lecture's .presmium/ keeps what is committed with it (the synthesis cache), not the working files of builds.
const KEPT = new Set(['speech', 'speech.lock.json'])
const copied = (source) => {
  const parts = relative(here, source).split(sep)
  if (parts.some(part => part === 'node_modules' || part === 'dist')) return false
  const deck = parts.indexOf('.presmium')
  return deck === -1 || deck === parts.length - 1 || KEPT.has(parts[deck + 1])
}
cpSync(here, target, { recursive: true, filter: copied })
symlinkSync(join(here, 'node_modules'), join(target, 'node_modules'), 'junction')
writeFileSync(join(target, '.gitignore'), 'node_modules\ndist/\n**/.presmium/*\n!**/.presmium/speech/\n!**/.presmium/speech.lock.json\n')
const git = args => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Presmium example', '-c', 'user.email=example@presmium.invalid', '-c', 'commit.gpgSign=false', ...args], { cwd: target, stdio: 'pipe' })
git(['init', '-q', '-b', 'main'])
git(['add', '-A'])
git(['commit', '-q', '-m', 'Presmium example: two lectures with animations in code'])
console.log(`example workspace: ${target}`)
