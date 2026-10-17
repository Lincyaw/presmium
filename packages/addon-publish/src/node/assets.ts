import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import { docBlocks, errorMessage, nodeMdast } from '@presmium/kernel'
import type { IRBlock, IRPass, MdastNode } from '@presmium/kernel'
import { ASSETS_DIR, assetExtension, PUBLISH_ID, publishOptions } from '../domain/index.ts'

const DOWNLOAD_TIMEOUT_MS = 15_000

/** Name of the downloads, the hash of their URL; other files of the directory are left alone. */
const DOWNLOAD = /^[\da-f]{16}\.[a-z\d]+$/

/**
 * Remote URLs whose download failed in this process, with why: a later
 * compilation (dev, the language server) does not wait for them again.
 */
const failed = new Map<string, string>()

/** The images of mdast. */
function images(node: MdastNode, found: MdastNode[] = []): MdastNode[] {
  if (node.type === 'image' && typeof node.url === 'string') found.push(node)
  node.children?.forEach(child => images(child, found))
  return found
}

/** The local copy of `url` in `dir`, which holds `existing`: downloaded unless an earlier compilation did. */
async function localCopy(url: string, dir: string, existing: readonly string[]): Promise<string> {
  const name = createHash('sha256').update(url).digest('hex').slice(0, 16)
  const found = existing.find(file => file.startsWith(`${name}.`))
  if (found) return join(dir, found)
  const before = failed.get(url)
  if (before !== undefined) throw new Error(before)
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const ext = assetExtension(url, response.headers.get('content-type'))
    if (!ext) throw new Error(`not an image (${response.headers.get('content-type') ?? 'no content type'})`)
    const file = join(dir, `${name}.${ext}`)
    await mkdir(dir, { recursive: true })
    await writeFile(file, Buffer.from(await response.arrayBuffer()))
    return file
  } catch (error) {
    failed.set(url, errorMessage(error))
    throw error
  }
}

/**
 * Remote images of the IR, such as PlantUML diagrams, are downloaded into
 * `<deck>/.presmium/assets` and referenced from there (P-51), so every
 * renderer publishes them with its output and the deck shows them offline.
 * Runs after the passes that create images. The images download at once,
 * each URL once; an image that cannot be downloaded stays remote, with a
 * warning, and is not tried again while the process runs. Downloads the deck
 * no longer uses are removed.
 */
export const remoteAssetsPass: IRPass = {
  name: 'remote-assets',
  order: 100,
  async run(doc, ctx) {
    if (!publishOptions({ presmium: doc.config.presmium }).offline) return
    const dir = join(ctx.deckDir, ASSETS_DIR)
    const remote: { node: MdastNode, block: IRBlock }[] = []
    for (const { block } of docBlocks(doc)) {
      for (const node of nodeMdast(block.node).flatMap(mdast => images(mdast))) {
        if (/^https?:\/\//i.test(node.url as string)) remote.push({ node, block })
      }
    }
    const existing = existsSync(dir) ? await readdir(dir) : []
    const urls = [...new Set(remote.map(({ node }) => node.url as string))]
    const copies = new Map(urls.map((url, i) => [url, i]))
    const settled = await Promise.allSettled(urls.map(url => localCopy(url, dir, existing)))
    const used = new Set<string>()
    // In the order of the blocks, as the diagnostics were before.
    for (const { node, block } of remote) {
      const url = node.url as string
      const copy = settled[copies.get(url)!]!
      if (copy.status === 'fulfilled') {
        used.add(basename(copy.value))
        node.url = relative(dirname(block.source.file), copy.value).split(sep).join('/')
      } else {
        ctx.report({
          checkId: PUBLISH_ID,
          severity: 'warning',
          message: `remote image ${url} was not downloaded (${errorMessage(copy.reason)}); it needs network when presenting`,
          source: { file: block.source.file, line: block.source.line },
        })
      }
    }
    for (const file of existing) {
      if (DOWNLOAD.test(file) && !used.has(file)) await rm(join(dir, file), { force: true })
    }
  },
}
