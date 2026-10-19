import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createVSIX } from '@vscode/vsce'

const pkg = fileURLToPath(new URL('..', import.meta.url))
const root = fileURLToPath(new URL('../../..', import.meta.url))
const manifest = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'))
const target = `${process.platform}-${process.arch}`
const pnpm = process.env.npm_execpath
if (!pnpm) throw new Error('Run this command with pnpm --filter presmium-vscode package:vsix')

function run(args, cwd) {
  const result = spawnSync(process.execPath, args, { cwd, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Build command failed with exit code ${result.status}`)
}

run(['scripts/build.mjs'], pkg)
mkdirSync(join(pkg, 'dist'), { recursive: true })
const staging = mkdtempSync(join(tmpdir(), 'presmium-vsix-'))
const output = join(pkg, 'dist', `${manifest.name}-${manifest.version}-${target}.vsix`)
try {
  const runtime = join(staging, 'runtime')
  run([pnpm, '--filter', '@presmium/language-server', 'deploy', '--prod', '--offline',
    '--config.inject-workspace-packages=true', '--config.node-linker=hoisted', runtime], root)
  for (const file of ['.pnpm', '.bin', '.modules.yaml']) rmSync(join(runtime, 'node_modules', file), { recursive: true, force: true })
  for (const file of ['pnpm-lock.yaml', 'pnpm-workspace.yaml']) rmSync(join(runtime, file), { force: true })
  for (const file of ['README.md', 'LICENSE', 'package.nls.json', 'package.nls.zh-cn.json', 'dist/extension.cjs']) {
    cpSync(join(pkg, file), join(staging, file), { recursive: true })
  }
  const { dependencies, devDependencies, scripts, ...installed } = manifest
  installed.files = ['dist/**', 'runtime/**', 'package.nls*.json', 'README.md', 'LICENSE']
  writeFileSync(join(staging, 'package.json'), JSON.stringify(installed, null, 2) + '\n')
  await createVSIX({ cwd: staging, packagePath: output, target, dependencies: false, followSymlinks: true })
  console.log(`VSIX: ${basename(output)}\n${output}`)
} finally {
  rmSync(staging, { recursive: true, force: true })
}
