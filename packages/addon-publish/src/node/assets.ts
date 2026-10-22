import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, sep } from 'node:path'
import { docBlocks, errorMessage, nodeMdast } from '@lincyaw/kernel'
import type { IRBlock, IRPass, MdastNode } from '@lincyaw/kernel'
import { ASSETS_DIR, assetExtension, PUBLISH_ID, toPublishOptions } from '../domain/index.ts'

const DOWNLOAD_TIMEOUT_MS = 15_000

const DOWNLOAD = /^[\da-f]{16}\.[a-z\d]+$/

const failed = new Map<string, string>()

function images(node: MdastNode, found: MdastNode[] = []): MdastNode[] {
  if (node.type === 'image' && typeof node.url === 'string') found.push(node)
  node.children?.forEach(child => images(child, found))
  return found
}

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

export const remoteAssetsPass: IRPass = {
  name: 'presmium.publish.remote-assets',
  order: 100,
  async run(doc, ctx) {
    if (!toPublishOptions({ presmium: doc.config.presmium }).offline) return
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
