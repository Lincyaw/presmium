import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, sep } from 'node:path'
import sharp from 'sharp'
import { CODE_DIR } from './site-files.ts'
import { MEDIA } from './publish.ts'

/**
 * Raster images a site publishes (a document's media and the images its scenes import) are encoded again as WebP and
 * no wider than any page shows them, when that saves at least a fifth: a paper's PNG figures and photographs are
 * the largest files most pages load. References in the site's pages, data and scripts follow the new names; files
 * the author publishes as they are (`public/`) are left alone.
 */

const RASTER = new Set(['.png', '.jpg', '.jpeg'])
// Below this an image is small enough that a second encoding gains little.
const MIN_BYTES = 48 * 1024
// The widest an image is drawn: a full-width figure on a large screen at twice its pixels.
const MAX_WIDTH = 2400
const TEXT = new Set(['.html', '.json', '.js', '.css', '.xml', '.vtt'])

function files(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(dir, entry.name)) : [join(dir, entry.name)])
}

/** A published image the build may encode again: in a media directory or among a code bundle's assets. */
function published(outDir: string, file: string): boolean {
  const parts = relative(outDir, file).split(sep)
  return parts.includes(MEDIA) || parts.some((part, i) => part === CODE_DIR && parts[i + 2] === 'assets')
}

export async function optimizeImages(outDir: string): Promise<{ images: number, saved: number }> {
  const all = files(outDir)
  const renamed = new Map<string, string>()
  let saved = 0
  for (const file of all) {
    if (!RASTER.has(extname(file).toLowerCase()) || !published(outDir, file)) continue
    const size = statSync(file).size
    if (size < MIN_BYTES) continue
    const target = join(dirname(file), `${basename(file, extname(file))}.webp`)
    if (existsSync(target)) {
      renamed.set(basename(file), basename(target))
      continue
    }
    const lossless = extname(file).toLowerCase() === '.png'
    const image = sharp(file).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true })
    // Figures and screenshots keep their sharp edges (near-lossless); photographs take ordinary lossy compression.
    const bytes = await (lossless ? image.webp({ nearLossless: true, quality: 75, effort: 5 }) : image.webp({ quality: 80, effort: 5 })).toBuffer()
    if (bytes.length > size * 0.8) continue
    // The original stays beside it: a reference this pass cannot see (an encoded name) still finds a file.
    writeFileSync(target, bytes)
    renamed.set(basename(file), basename(target))
    saved += size - bytes.length
  }
  if (renamed.size > 0) {
    const names = new RegExp([...renamed.keys()].map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g')
    for (const file of all) {
      if (!TEXT.has(extname(file)) || !existsSync(file)) continue
      const text = readFileSync(file, 'utf8')
      const next = text.replace(names, name => renamed.get(name)!)
      if (next !== text) writeFileSync(file, next)
    }
  }
  return { images: renamed.size, saved }
}
