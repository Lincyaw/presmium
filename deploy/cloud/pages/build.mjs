// Builds the pages the cloud's JupyterHub and single-user servers can still show: `build.mjs <out dir>` writes the
// templates of ./templates with the design system's styles, the brand mark and its icon put in, for
// JupyterHub's template_paths and the single-user server's extra_template_paths. Pure Node; reads @lincyaw/design's
// sources by their path in the repository, so it runs wherever the repository's packages are.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const design = resolve(here, '../../../packages/design/src')
if (!process.argv[2]) throw new Error('usage: build.mjs <out dir>')
const out = resolve(process.argv[2])
const { brandMarkup } = await import(join(design, 'assets', 'brand.ts'))

// The design system's styles without its web fonts (the pages use the system's) and the pages' own layout.
const css = (await Promise.all(['tokens.css', 'components.css', 'typography.css', 'layout.css'].map(name => readFile(join(design, name), 'utf8'))))
  .concat(await readFile(join(here, 'pages.css'), 'utf8')).join('\n')
// The styles sit in a template's raw block; only its end marker could break out of it.
if (css.includes('endraw')) throw new Error('the styles contain a template end marker')
const mark = brandMarkup()
// The icon has no stylesheet: its colours are the light theme's tokens.
const token = name => new RegExp(`--pm-color-${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim()
const icon = `data:image/svg+xml,${encodeURIComponent(mark.replace('var(--pm-color-accent)', token('accent')).replace('var(--pm-color-bg)', token('bg')))}`

await mkdir(out, { recursive: true })
for (const name of await readdir(join(here, 'templates'))) {
  const source = await readFile(join(here, 'templates', name), 'utf8')
  await writeFile(join(out, name), source.replace('/* presmium:styles */', css).replace('<!-- presmium:mark -->', mark).replace('presmium:icon', icon))
}
console.log(`cloud pages: ${out}`)
