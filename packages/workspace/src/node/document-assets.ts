import { createReadStream, realpathSync } from 'node:fs'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { lookup } from 'mime-types'
import type { TeachingDocument } from '@lincyaw/kernel'
import { RequestError } from './errors.ts'

/** Read only a file registered by the current canonical document, without compiling it. */
export function documentAssetResponse(root: string, directory: string, document: TeachingDocument, id: string, readableFile: (path: string) => string, signal?: AbortSignal): Response {
  const asset = document.assets[id]
  if (!asset) throw new RequestError(404, 'document-asset-missing')
  if (!asset.location || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(asset.location)) throw new RequestError(400, 'document-asset-not-local')
  let location = asset.location.replace(/[?#].*$/s, '')
  try { location = decodeURIComponent(location) } catch { throw new RequestError(400, 'document-asset-path') }
  if (!location || isAbsolute(location) || location.includes('\\') || location.includes('\0')) throw new RequestError(400, 'document-asset-path')
  const workspace = realpathSync(root), target = resolve(workspace, directory, location)
  const path = relative(workspace, target)
  if (!path || path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path)) throw new RequestError(403, 'document-asset-outside-workspace')
  const file = readableFile(path.split(sep).join('/'))
  const type = lookup(file) || 'application/octet-stream'
  const inline = /^(?:image\/(?:png|jpeg|gif|webp|avif|svg\+xml|bmp|x-icon)|audio\/|video\/)/i.test(type)
  return new Response(Readable.toWeb(createReadStream(file, { signal })), { headers: {
    'content-type': type,
    'cache-control': 'private, no-store',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(basename(file))}`,
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'",
  } })
}
