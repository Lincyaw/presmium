import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import type { Finding, IRBlock, IRPass, MdastNode } from '@presmium/kernel'
import { ASSETS_DIR, assetExtension, PUBLISH_ID, publishOptions } from '../domain/index.ts'

const DOWNLOAD_TIMEOUT_MS = 15_000

/** The images of a block: in its Markdown, its component's fallback and its child blocks. */
function images(block: IRBlock, found: { node: MdastNode, block: IRBlock }[] = []) {
  const walk = (node: MdastNode) => {
    if (node.type === 'image' && typeof node.url === 'string') found.push({ node, block })
    node.children?.forEach(walk)
  }
  const { node } = block
  if (node.type === 'markdown') walk(node.mdast)
  if (node.type === 'component') {
    if (node.fallback) walk(node.fallback)
    node.children?.forEach(child => images(child, found))
  }
  return found
}

/** Name of the downloads, the hash of their URL; other files of the directory are left alone. */
const DOWNLOAD = /^[\da-f]{16}\.[a-z\d]+$/

/** The local copy of `url` in `dir`, downloaded unless an earlier compilation did. */
async function localCopy(url: string, dir: string): Promise<string> {
  const name = createHash('sha256').update(url).digest('hex').slice(0, 16)
  const existing = existsSync(dir) ? (await readdir(dir)).find(file => file.startsWith(`${name}.`)) : undefined
  if (existing) return join(dir, existing)
  const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const ext = assetExtension(url, response.headers.get('content-type'))
  if (!ext) throw new Error(`not an image (${response.headers.get('content-type') ?? 'no content type'})`)
  const file = join(dir, `${name}.${ext}`)
  await mkdir(dir, { recursive: true })
  await writeFile(file, Buffer.from(await response.arrayBuffer()))
  return file
}

/**
 * Remote images of the IR, such as PlantUML diagrams, are downloaded into
 * `<deck>/.presmium/assets` and referenced from there (P-51), so every
 * renderer publishes them with its output and the deck shows them offline.
 * Runs after the passes that create images. An image that cannot be
 * downloaded stays remote, with a warning. Downloads the deck no longer uses
 * are removed.
 */
export const remoteAssetsPass: IRPass = {
  name: 'remote-assets',
  order: 100,
  async run(doc, ctx) {
    if (!publishOptions({ presmium: doc.config.presmium }).offline) return
    const dir = join(ctx.deckDir, ASSETS_DIR)
    const copies = new Map<string, Promise<string>>()
    const used = new Set<string>()
    const warn = (finding: Omit<Finding, 'checkId' | 'severity'>) => ctx.report({ checkId: PUBLISH_ID, severity: 'warning', ...finding })
    for (const section of doc.sections) {
      for (const { node, block } of section.blocks.flatMap(b => images(b))) {
        const url = node.url as string
        if (!/^https?:\/\//i.test(url)) continue
        if (!copies.has(url)) copies.set(url, localCopy(url, dir))
        try {
          const file = await copies.get(url)!
          used.add(basename(file))
          node.url = relative(dirname(block.source.file), file).split(sep).join('/')
        } catch (error) {
          warn({
            message: `remote image ${url} was not downloaded (${error instanceof Error ? error.message : String(error)}); it needs network when presenting`,
            source: { file: block.source.file, line: block.source.line },
          })
        }
      }
    }
    if (!existsSync(dir)) return
    for (const file of await readdir(dir)) {
      if (DOWNLOAD.test(file) && !used.has(file)) await rm(join(dir, file), { force: true })
    }
  },
}
