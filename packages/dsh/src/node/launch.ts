/**
 * How a launcher starts DeepSeek Harness with this bundle (docs/design-dsh.md
 * 6.1, 6.6 and 11.1): `presmium studio` (WP-96f) and the tests' harness. A
 * profile of Presmium's lists the carrier's bundles and this one, and links
 * this package into its `node_modules` (DeepSeek Harness resolves a bundle's
 * modules from the profile, K8); every start passes the carrier's patches
 * after the profile's own, and the environment that keeps the user's skills
 * and the telemetry out.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** DeepSeek Harness's carriers this bundle supports. */
export type Carrier = 'web' | 'headless' | 'acp'

/** This package's directory. */
export const PACKAGE_DIR = fileURLToPath(new URL('../..', import.meta.url))
export const PACKAGE_NAME = '@presmium/dsh'

/** The bundles of each carrier, DeepSeek Harness's own first. */
const CARRIERS: Record<Carrier, string> = {
  web: '@deepseek-ai/dsh-web-app',
  headless: '@deepseek-ai/dsh-headless',
  acp: '@deepseek-ai/dsh-acp-app',
}

/** The `--patch` overlays of a start, in order: the web carrier's rows, then Presmium's profile settings. */
export function launchPatches(carrier: Carrier): string[] {
  return [...carrier === 'web' ? [join(PACKAGE_DIR, 'web.patch.yml')] : [], join(PACKAGE_DIR, 'profile.patch.yml')]
}

/** The version of DeepSeek Harness this bundle is for (`engines.dsh`): exactly one. */
export function dshVersion(): string {
  return (JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8')) as { engines: { dsh: string } }).engines.dsh
}

/** The `dsh` command of the installed `@deepseek-ai/dsh`, resolved from this package (not a `.bin` of some root). */
export function dshBin(from = PACKAGE_DIR): string {
  const manifest = createRequire(join(from, 'package.json')).resolve('@deepseek-ai/dsh/package.json')
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin: string | Record<string, string> }
  return join(dirname(manifest), typeof bin === 'string' ? bin : bin.dsh!)
}

/**
 * The environment DeepSeek Harness starts with besides the launcher's own:
 * its home, an agents root of Presmium's (empty: the user's `~/.agents/skills`
 * stay out, with the profile patch's `agentsHome`) and no telemetry.
 */
export function launchEnv(dshHome: string): Record<string, string> {
  return { DSH_HOME: dshHome, DSH_AGENTS_HOME: join(dshHome, 'agents'), DSH_TELEMETRY_MODE: 'DISABLED' }
}

/**
 * Writes the profile `name` of a carrier in `dshHome` (once: the user's own
 * patch, `cordis.patch.yml`, is kept) and links this package, or `bundle`,
 * into its `node_modules`.
 */
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
