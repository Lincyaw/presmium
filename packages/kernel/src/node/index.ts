import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { LocalAsset } from '../ir.ts'
export { optimizeDeps, preBundle } from './dependencies.ts'
export { backgroundPriority, NODE_RESOURCE_ARGS, resourceEnvironment } from './resources.ts'
export { irRevision } from './revision.ts'

export function copyPublished(found: LocalAsset, dir: string): string {
  const target = join(dir, found.name)
  if (!existsSync(target)) {
    mkdirSync(dir, { recursive: true })
    cpSync(found.file, target, { recursive: true })
  }
  return target
}

export const FONT_LICENSE = 'presmium/fonts/LICENSE'

const FONT_COPYRIGHTS: Record<string, string> = {
  '@fontsource/ibm-plex-mono': 'IBM Plex Mono: Copyright 2017 IBM Corp. All rights reserved.',
  '@fontsource/ibm-plex-sans': 'IBM Plex Sans: Copyright 2019 IBM Corp. All rights reserved.',
  '@fontsource/source-serif-4': 'Source Serif 4: Copyright 2014 - 2021 Adobe Systems Incorporated (http://www.adobe.com/), with Reserved Font Name \'Source\'.',
}

export function fontLicense(from: string | URL): string {
  const manifest = findPackageJSON('@lincyaw/host', from)
  if (!manifest) throw new Error('@lincyaw/host is not installed')
  const { dependencies = {} } = JSON.parse(readFileSync(manifest, 'utf8')) as { dependencies?: Record<string, string> }
  const require = createRequire(manifest)
  const files = Object.keys(dependencies).filter(name => name.startsWith('@fontsource/')).sort().map((name) => {
    const copyright = FONT_COPYRIGHTS[name] ? `${FONT_COPYRIGHTS[name]}\n\n` : ''
    return `${name}\n\n${copyright}${readFileSync(require.resolve(`${name}/LICENSE`), 'utf8').trim()}\n`
  })
  return [`The fonts of this site, from Fontsource, with their copyrights and licenses (SIL Open Font License 1.1).\n`, ...files].join(`\n${'='.repeat(78)}\n\n`)
}

export const TYPESCRIPT_IMPORT: readonly string[] = ['--import', new URL('./strip-types.mjs', import.meta.url).href]

export function packageOf(file: string): string | undefined {
  const manifest = findPackageJSON(pathToFileURL(file))
  return manifest && dirname(manifest)
}
