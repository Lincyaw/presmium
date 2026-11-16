// Sign the final distribution bytes, including the recompressed DEB, then export one platform shard.
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { run } from '@tauri-apps/cli'
const root = fileURLToPath(new URL('../../..', import.meta.url))
const version = JSON.parse(readFileSync(join(root, 'packages/presmium/package.json'), 'utf8')).version
const target = process.argv[2]
const bundles = {
  'darwin-arm64': [['macos', '.app.tar.gz', 'darwin-aarch64-app']],
  'darwin-x64': [['macos', '.app.tar.gz', 'darwin-x86_64-app']],
  'win32-arm64': [['nsis', '.exe', 'windows-aarch64-nsis']],
  'win32-x64': [['nsis', '.exe', 'windows-x86_64-nsis']],
  'linux-arm64': [['deb', '.deb', 'linux-aarch64-deb'], ['rpm', '.rpm', 'linux-aarch64-rpm']],
  'linux-x64': [['deb', '.deb', 'linux-x86_64-deb'], ['rpm', '.rpm', 'linux-x86_64-rpm']],
}[target]
if (!bundles || !process.env.TAURI_SIGNING_PRIVATE_KEY) throw new Error('Updater collection requires a target and signing key')
const out = resolve(root, 'installers'); mkdirSync(out, { recursive: true })
const platforms = {}
for (const [folder, extension, platform] of bundles) {
  const dir = join(root, 'packages/desktop/src-tauri/target/release/bundle', folder)
  const files = readdirSync(dir).filter(file => file.endsWith(extension))
  if (files.length !== 1) throw new Error(`Expected exactly one ${extension} package in ${dir}`)
  const source = join(dir, files[0])
  await run(['signer', 'sign', '--app-version', version, '--password', process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? '', source])
  execFileSync('cargo', ['run', '--release', '--locked', '--package', 'presmium-update-verifier', '--', version, source], { cwd: join(root, 'packages/desktop/src-tauri'), stdio: 'inherit' })
  const name = `Presmium-Studio-${version}-${target}${extension}`
  copyFileSync(source, join(out, name)); copyFileSync(`${source}.sig`, join(out, `${name}.sig`))
  platforms[platform] = { signature: readFileSync(`${source}.sig`, 'utf8').trim(), url: `https://github.com/Lincyaw/presmium/releases/download/v${version}/${name}` }
}
writeFileSync(join(out, `updater-${target}.json`), JSON.stringify({ version, platforms }, null, 2) + '\n')
