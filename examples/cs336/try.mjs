import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const target = resolve(process.argv[2] ?? '.presmium/cs336-workspace')
if (existsSync(target) && readdirSync(target).length) throw new Error(`${target} already exists and is not empty`)
cpSync(here, target, { recursive: true, filter: source => !['node_modules', '.presmium', 'dist'].includes(source.split('/').at(-1)) })
symlinkSync(join(here, 'node_modules'), join(target, 'node_modules'), 'junction')
writeFileSync(join(target, '.gitignore'), 'node_modules/\ndist/\n**/.presmium/\n')
const git = args => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Presmium example', '-c', 'user.email=example@presmium.invalid', '-c', 'commit.gpgSign=false', ...args], { cwd: target, stdio: 'pipe' })
git(['init', '-q', '-b', 'main'])
git(['add', '-A'])
git(['commit', '-q', '-m', 'Stanford CS336: complete Spring 2026 course'])
console.log(`CS336 workspace: ${target}`)
