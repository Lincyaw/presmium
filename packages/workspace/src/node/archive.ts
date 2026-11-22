import { createReadStream, createWriteStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import JSZip from 'jszip'

// Files already compressed are stored as they are: deflating them again costs time and saves nothing.
const STORED = /\.(?:png|jpe?g|gif|webp|avif|ico|mp4|webm|mov|mp3|m4a|aac|ogg|opus|flac|woff2?|zip|gz|br|pdf|pptx)$/i

async function filesBelow(dir: string): Promise<string[]> {
  const found: string[] = []
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) found.push(...await filesBelow(path))
    else if (entry.isFile()) found.push(path)
  }
  return found
}

/**
 * Writes the files below `dir` into the ZIP archive `file`, their paths relative to `dir`. Each file is read as a
 * stream and written as it is compressed (JSZip's `streamFiles`), in small steps, so a large site neither fills the
 * memory nor holds up the service's other requests.
 */
export async function writeArchive(dir: string, file: string, signal?: AbortSignal): Promise<void> {
  const zip = new JSZip()
  for (const path of await filesBelow(dir)) {
    const name = relative(dir, path).split(sep).join('/')
    zip.file(name, createReadStream(path), { binary: true, compression: STORED.test(name) ? 'STORE' : 'DEFLATE', compressionOptions: { level: 6 } })
  }
  signal?.throwIfAborted()
  await pipeline(zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true }), createWriteStream(file), signal ? { signal } : {})
}
