import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isRecord } from '@lincyaw/kernel'
import type { LocalAsset } from '@lincyaw/kernel'
import { copyPublished, threadBudget } from '@lincyaw/kernel/node'
import type { Plugin } from 'vite'
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

/** The parser's nodes, including TS and JSX; strings and comments are never considered asset expressions. */
function nodes(value: unknown, found: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(value)) for (const item of value) nodes(item, found)
  else if (isRecord(value)) {
    if (typeof value.type === 'string') found.push(value)
    for (const item of Object.values(value)) if (item && typeof item === 'object') nodes(item, found)
  }
  return found
}
const namesURL = (value: unknown) => nodes(value).some(node => node.type === 'Identifier' && node.name === 'URL')
/** Conservatively leave a module alone if a local binding could replace the native URL constructor. */
function shadowsURL(node: Record<string, unknown>): boolean {
  if (node.type === 'VariableDeclarator' || node.type === 'ClassDeclaration' || node.type === 'ClassExpression') return namesURL(node.id)
  if (typeof node.type === 'string' && /Function/.test(node.type)) return namesURL(node.id) || namesURL(node.params)
  if (typeof node.type === 'string' && node.type.startsWith('Import')) return namesURL(node.local)
  return node.type === 'CatchClause' && namesURL(node.param)
}

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
  vitePlugin(onFile?: (file: string) => void, onImage?: (module: string, reference: string) => void): Plugin {
    const encoder = this
    return {
      name: 'presmium:webp-images',
      enforce: 'pre' as const,
      async load(id) {
        // An image imported for its URL, plainly or with `?url`; other queries (`?raw`, `?inline`) want its bytes.
        const file = id.replace(/\?url$/, '')
        if (/[?#]/.test(file) || !encodable(file)) return undefined
        this.addWatchFile(file)
        onFile?.(file)
        const reference = this.emitFile({ type: 'asset', name: webpName(file), source: await encoder.encode(file) })
        onImage?.(id, reference)
        return `export default import.meta.ROLLUP_FILE_URL_${reference}`
      },
      async transform(code, id) {
        if (!/\.[cm]?[jt]sx?$/.test(id) || !code.includes('import.meta') || !code.includes('URL')) return undefined
        const lang = /\.tsx$/.test(id) ? 'tsx' : /\.[cm]?ts$/.test(id) ? 'ts' : /\.jsx$/.test(id) ? 'jsx' : 'js'
        const ast = nodes(this.parse(code, { lang }))
        if (ast.some(shadowsURL)) return undefined
        const changes: { start: number, end: number, value: string }[] = []
        for (const node of ast) {
          if (node.type !== 'NewExpression' || !isRecord(node.callee) || node.callee.type !== 'Identifier' || node.callee.name !== 'URL' || !Array.isArray(node.arguments) || node.arguments.length !== 2) continue
          const [path, base] = node.arguments
          if (!isRecord(path) || path.type !== 'Literal' || typeof path.value !== 'string' || !path.value.startsWith('.') || /[?#]/.test(path.value) || !isRecord(base)) continue
          if (code.slice(Number(base.start), Number(base.end)).replace(/\s/g, '') !== 'import.meta.url') continue
          const file = fileURLToPath(new URL(path.value, pathToFileURL(id)))
          if (!encodable(file)) continue
          this.addWatchFile(file)
          onFile?.(file)
          const reference = this.emitFile({ type: 'asset', name: webpName(file), source: await encoder.encode(file) })
          onImage?.(id, reference)
          changes.push({ start: Number(path.start), end: Number(path.end), value: `import.meta.ROLLUP_FILE_URL_${reference}` })
        }
        if (!changes.length) return undefined
        for (const { start, end, value } of changes.sort((a, b) => b.start - a.start)) code = code.slice(0, start) + value + code.slice(end)
        return { code, map: null }
      },
    }
  }
}
