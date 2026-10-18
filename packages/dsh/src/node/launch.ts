import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Carrier = 'web' | 'headless' | 'acp'

export const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url))
export const PACKAGE_NAME = '@presmium/dsh'

const CARRIERS: Record<Carrier, string> = {
  web: '@deepseek-ai/dsh-web-app',
  headless: '@deepseek-ai/dsh-headless',
  acp: '@deepseek-ai/dsh-acp-app',
}

export function launchPatches(carrier: Carrier): string[] {
  return [...carrier === 'web' ? [join(PACKAGE_DIR, 'web.patch.yml')] : [], join(PACKAGE_DIR, 'profile.patch.yml')]
}

export function launchArgs(name: string, carrier: Carrier): string[] {
  return ['--profile', name, ...launchPatches(carrier).flatMap(file => ['--patch', file])]
}

export const WATCHDOG = join(PACKAGE_DIR, 'src', 'node', 'watchdog.mjs')

export const WEB_READY = /^dsh web: (https?:\/\/\S+)$/m

export function dshVersion(): string {
  return (JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8')) as { engines: { dsh: string } }).engines.dsh
}

export function dshBin(from = PACKAGE_DIR): string {
  const manifest = createRequire(join(from, 'package.json')).resolve('@deepseek-ai/dsh/package.json')
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin: string | Record<string, string> }
  return join(dirname(manifest), typeof bin === 'string' ? bin : bin.dsh!)
}

export function launchEnv(dshHome: string): Record<string, string> {
  return { DSH_HOME: dshHome, DSH_AGENTS_HOME: join(dshHome, 'agents'), DSH_TELEMETRY_MODE: 'DISABLED' }
}

export function writeProfile(dshHome: string, name: string, carrier: Carrier, bundle = PACKAGE_DIR): string {
  const dir = join(dshHome, 'profiles', name)
  mkdirSync(join(dir, 'node_modules', '@presmium'), { recursive: true })
  mkdirSync(join(dshHome, 'agents'), { recursive: true })
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({
    name: `dsh-profile-${name}`,
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', CARRIERS[carrier], PACKAGE_NAME] } },
  }, null, 2)}\n`)
  writeFileSync(join(dir, 'cordis.yml'), '# The profile root: an empty entry list; the tree is composed from the bundles and the patches.\n[]\n')
  if (!existsSync(join(dir, 'cordis.patch.yml'))) writeFileSync(join(dir, 'cordis.patch.yml'), '# Your patch layer for this profile (Presmium\'s settings are passed with --patch after it).\n[]\n')
  const link = join(dir, 'node_modules', PACKAGE_NAME)
  rmSync(link, { force: true, recursive: true })
  symlinkSync(realpathSync(bundle), link, 'junction')
  return dir
}
