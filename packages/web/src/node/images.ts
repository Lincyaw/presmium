import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { LocalAsset } from '@lincyaw/kernel'
import { copyPublished, threadBudget } from '@lincyaw/kernel/node'
import pLimit from 'p-limit'
import sharp from 'sharp'

/**
 * Raster images a site publishes are encoded again as WebP and no wider than any page shows them: a paper's PNG
 * figures and photographs are the largest files most pages load. The name is decided where the image is published (a
 * document's media, an image a scene imports), so every reference is written with it; an encoding is kept under the
 * build's work directory by the image's content and made once. Files the author publishes as they are (`public/`) and
 * the images a page's head names for link previews keep their format.
 */

const RASTER = new Set(['.png', '.jpg', '.jpeg'])
// Below this an image is small enough that a second encoding gains little.
const MIN_BYTES = 48 * 1024
// The widest an image is drawn: a full-width figure on a large screen at twice its pixels.
const MAX_WIDTH = 2400

export interface EncodedImages {
  images: number
  saved: number
}

function encodable(file: string): boolean {
  if (!RASTER.has(extname(file).toLowerCase())) return false
  const stat = statSync(file, { throwIfNoEntry: false })
  return stat !== undefined && stat.isFile() && stat.size >= MIN_BYTES
}

/** Where a workspace keeps its encoded images, by their content. */
export const imageCache = (workspaceRoot: string) => join(workspaceRoot, '.presmium', 'images')

const webpName = (name: string) => `${basename(name, extname(name))}.webp`

export class ImageEncoder {
  readonly #cacheDir: string
  readonly #limit = pLimit(threadBudget('background'))
  readonly #pending: Promise<void>[] = []
  #encoded: EncodedImages = { images: 0, saved: 0 }

  constructor(cacheDir: string) {
    this.#cacheDir = cacheDir
  }

  /** The image as WebP, from the cache when it was encoded before. */
  encode(file: string): Promise<Buffer> {
    return this.#limit(async () => {
      const source = readFileSync(file)
      const cached = join(this.#cacheDir, `${createHash('sha256').update(source).digest('hex')}.webp`)
      if (existsSync(cached)) return readFileSync(cached)
      const image = sharp(source).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true })
      // Figures and screenshots keep their sharp edges (near-lossless); photographs take ordinary lossy compression.
      const bytes = await (extname(file).toLowerCase() === '.png' ? image.webp({ nearLossless: true, quality: 75, effort: 5 }) : image.webp({ quality: 80, effort: 5 })).toBuffer()
      mkdirSync(this.#cacheDir, { recursive: true })
      writeFileSync(`${cached}.${process.pid}`, bytes)
      renameSync(`${cached}.${process.pid}`, cached)
      this.#encoded = { images: this.#encoded.images + 1, saved: this.#encoded.saved + Math.max(0, source.length - bytes.length) }
      return bytes
    })
  }

  /** Publishes a local file into `dir`: a raster image under its WebP name, written once its encoding is done. */
  publish(asset: LocalAsset, dir: string): LocalAsset {
    if (asset.directory || !encodable(asset.file)) {
      copyPublished(asset, dir)
      return asset
    }
    const published = { ...asset, name: webpName(asset.name) }
    const target = join(dir, published.name)
    if (!existsSync(target)) {
      this.#pending.push(this.encode(asset.file).then((bytes) => {
        mkdirSync(dir, { recursive: true })
        writeFileSync(target, bytes)
      }))
    }
    return published
  }

  /** Waits for the images published so far; what this encoder has encoded (not taken from its cache). */
  async done(): Promise<EncodedImages> {
    while (this.#pending.length > 0) await Promise.all(this.#pending.splice(0))
    return this.#encoded
  }

  /** A Vite plugin: a raster image a module imports is emitted as WebP, and the import is its URL. */
  vitePlugin() {
    const encoder = this
    return {
      name: 'presmium:webp-images',
      enforce: 'pre' as const,
      load: async function (this: { emitFile(file: { type: 'asset', name: string, source: Uint8Array }): string }, id: string) {
        // An image imported for its URL, plainly or with `?url`; other queries (`?raw`, `?inline`) want its bytes.
        const file = id.replace(/\?url$/, '')
        if (/[?#]/.test(file) || !encodable(file)) return undefined
        const reference = this.emitFile({ type: 'asset', name: webpName(file), source: await encoder.encode(file) })
        return `export default import.meta.ROLLUP_FILE_URL_${reference}`
      },
    }
  }
}
