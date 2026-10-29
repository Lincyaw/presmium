import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Pure Node: the image only installs @lincyaw/design and its declared dependencies.
const directory = dirname(fileURLToPath(import.meta.url))
const source = join(directory, 'theme', 'presmium')
const output = resolve(process.argv[2] ?? join(directory, 'theme-output'))
const login = join(output, 'presmium', 'login')
const resources = join(login, 'resources')
const designRequire = createRequire(join(directory, '../../../packages/design/package.json'))
const { brandMarkup, iconMarkup } = await import(designRequire.resolve('@lincyaw/design'))
const cssImports = /@import\s+(['"])([^'"]+)\1\s*;/g
const cssURLs = /url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/g
const active = new Set()
const fonts = new Map()

async function bundleCSS(filename) {
  if (active.has(filename)) throw new Error(`Circular stylesheet import: ${filename}`)
  active.add(filename)
  const css = await readFile(filename, 'utf8')
  // Rewrite each file's URLs before inserting imports, so an import's assets retain its own base.
  const urlParts = []
  let offset = 0
  for (const match of css.matchAll(cssURLs)) {
    const target = match[2]
    if (/^(?:data:|#)/.test(target)) continue
    if (/^(?:[a-z]+:|\/\/|\/)/i.test(target)) throw new Error(`Non-local stylesheet asset: ${target}`)
    const file = resolve(dirname(filename), target)
    const extension = extname(file)
    if (!['.woff', '.woff2'].includes(extension)) throw new Error(`Unexpected design asset: ${target}`)
    const bytes = await readFile(file)
    const name = `${createHash('sha256').update(bytes).digest('hex')}${extension}`
    fonts.set(name, bytes)
    urlParts.push(css.slice(offset, match.index), `url('../fonts/${name}')`)
    offset = match.index + match[0].length
  }
  urlParts.push(css.slice(offset))
  const rewritten = urlParts.join('')
  const parts = []
  offset = 0
  for (const match of rewritten.matchAll(cssImports)) {
    const specifier = match[2]
    const imported = specifier.startsWith('.')
      ? resolve(dirname(filename), specifier)
      : createRequire(filename).resolve(specifier)
    parts.push(rewritten.slice(offset, match.index), await bundleCSS(imported))
    offset = match.index + match[0].length
  }
  parts.push(rewritten.slice(offset))
  active.delete(filename)
  return parts.join('\n')
}

async function fingerprintAsset(filename, content) {
  const extension = extname(filename)
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 16)
  const fingerprinted = `${filename.slice(0, -extension.length)}.${hash}${extension}`
  await writeFile(join(resources, fingerprinted), content)
  await rm(join(resources, filename), { force: true })
  return fingerprinted
}

await mkdir(output, { recursive: true })
await cp(source, join(output, 'presmium'), { recursive: true })
const css = await bundleCSS(designRequire.resolve('@lincyaw/design/design.css'))
if (/@import\b/.test(css)) throw new Error('Unresolved design stylesheet import')
await mkdir(join(resources, 'css'), { recursive: true })
await mkdir(join(resources, 'fonts'), { recursive: true })
await mkdir(join(resources, 'licenses'), { recursive: true })
await cp(join(directory, '../../../packages/design/LICENSE'), join(resources, 'licenses', 'presmium-design.txt'))
await cp(designRequire.resolve('lucide/LICENSE'), join(resources, 'licenses', 'lucide.txt'))
const styles = [
  await fingerprintAsset('css/design.css', css),
  await fingerprintAsset('css/layout.css', await readFile(join(source, 'login/resources/css/layout.css'))),
]
// The public constant SVG is embedded synchronously; appearance.js never fetches HTML or replaces forms.
const scripts = [
  await fingerprintAsset('js/brand.js', `globalThis.PresmiumBrandMarkup = ${JSON.stringify(brandMarkup())}\nglobalThis.PresmiumLanguageIconMarkup = ${JSON.stringify(iconMarkup('language'))}\n`),
  await fingerprintAsset('js/appearance.js', await readFile(join(source, 'login/resources/js/appearance.js'))),
]
let properties = await readFile(join(source, 'login/theme.properties'), 'utf8')
for (const [key, entries] of [['styles', styles], ['scripts', scripts]]) {
  const line = new RegExp(`^${key}=.*$`, 'm')
  if (!line.test(properties)) throw new Error(`Missing theme resource property: ${key}`)
  properties = properties.replace(line, `${key}=${entries.join(' ')}`)
}
await writeFile(join(login, 'theme.properties'), properties)
for (const [name, bytes] of fonts) await writeFile(join(resources, 'fonts', name), bytes)
for (const family of ['ibm-plex-sans', 'source-serif-4', 'ibm-plex-mono']) {
  await cp(designRequire.resolve(`@fontsource/${family}/LICENSE`), join(resources, 'licenses', `${family}.txt`))
}
console.log(`Keycloak theme: ${login} (${fonts.size} local font files)`)
