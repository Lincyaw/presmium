import { createHash } from 'node:crypto'
import { closeSync, createReadStream, fstatSync } from 'node:fs'
import { Input, ALL_FORMATS, BufferSource } from 'mediabunny'
import { ProductionAudioRefusal } from '@lincyaw/kernel'
import type { IRDocument, ProductionAssetInspection } from '@lincyaw/kernel'
import { productionAssetFile } from '@lincyaw/kernel/node'
import { openInDeck } from './store.ts'

export class ProductionAssetRefusal extends ProductionAudioRefusal {
  constructor(code: string) { super(code === 'production.asset-changed' ? 409 : 422, code) }
}
export interface ProductionAssetFile { asset: ProductionAssetInspection, path: string, stamp: string, extension: string }
const MAX_BYTES = 16 << 20
const MAX_DURATION_MS = 10 * 60 * 1000
const extensions: Record<string, string> = { 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm' }
const stamp = (file: ReturnType<typeof fstatSync>) => [file.dev, file.ino, file.size, file.mtimeMs, file.ctimeMs].join(':')

async function readAudioFile(deckDir: string, file: string, signal?: AbortSignal): Promise<{ bytes: Buffer, identity: string }> {
  signal?.throwIfAborted()
  const fd = openInDeck(deckDir, file)
  if (fd === undefined) throw new ProductionAssetRefusal('production.asset-file')
  let bytes: Buffer, identity: string
  try {
    const before = fstatSync(fd)
    if (!before.size || before.size > MAX_BYTES) throw new ProductionAssetRefusal('production.asset-size')
    identity = stamp(before)
    const chunks: Buffer[] = []
    let length = 0
    for await (const value of createReadStream('', { fd, autoClose: false, signal })) {
      const chunk = Buffer.from(value)
      length += chunk.length
      if (length > MAX_BYTES) throw new ProductionAssetRefusal('production.asset-size')
      chunks.push(chunk)
    }
    if (stamp(fstatSync(fd)) !== identity) throw new ProductionAssetRefusal('production.asset-changed')
    bytes = Buffer.concat(chunks)
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof ProductionAssetRefusal) throw error
    throw new ProductionAssetRefusal('production.asset-file')
  } finally { closeSync(fd) }
  signal?.throwIfAborted()
  return { bytes, identity }
}

/** Uploads and already-declared files use the same actual-byte probe. No file is written here. */
export async function inspectProductionAudioBytes(assetId: string, value: Uint8Array, signal?: AbortSignal): Promise<{ inspection: ProductionAssetInspection, extension: string }> {
  signal?.throwIfAborted()
  if (!value.byteLength || value.byteLength > MAX_BYTES) throw new ProductionAssetRefusal('production.asset-size')
  const bytes = Buffer.from(value), sha256 = createHash('sha256').update(bytes).digest('hex')
  const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) })
  const cancel = () => input.dispose()
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    signal?.throwIfAborted()
    const audio = await input.getAudioTracks(), video = await input.getVideoTracks()
    if (audio.length !== 1 || video.length || audio[0]!.numberOfChannels < 1 || audio[0]!.numberOfChannels > 2) throw new ProductionAssetRefusal('production.asset-format')
    const mediaType = (await input.getMimeType()).split(';')[0]!.trim(), extension = extensions[mediaType]
    if (!extension || !audio[0]!.codec) throw new ProductionAssetRefusal('production.asset-format')
    const durationMs = Math.round(await input.computeDuration() * 1000)
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_DURATION_MS) throw new ProductionAssetRefusal('production.asset-duration')
    signal?.throwIfAborted()
    return { extension, inspection: { assetId, mediaId: createHash('sha256').update(JSON.stringify(['presmium.asset-audio', assetId, sha256])).digest('hex').slice(0, 32), kind: 'audio', sha256, durationMs, byteLength: bytes.length, mediaType, codec: audio[0]!.codec, sampleRate: audio[0]!.sampleRate, channels: audio[0]!.numberOfChannels } }
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof ProductionAssetRefusal) throw error
    throw new ProductionAssetRefusal('production.asset-format')
  } finally { signal?.removeEventListener('abort', cancel); input.dispose() }
}

/** Reads only a declared asset ID, through the same-document regular-file boundary. */
export async function inspectProductionAsset(doc: Pick<IRDocument, 'productionAssets'>, deckDir: string, assetId: string, signal?: AbortSignal): Promise<ProductionAssetFile> {
  signal?.throwIfAborted()
  const declared = doc.productionAssets?.[assetId]
  if (!declared) throw new ProductionAssetRefusal('production.asset-missing')
  if (declared.kind !== 'audio') throw new ProductionAssetRefusal('production.asset-kind')
  const file = productionAssetFile(deckDir, declared.location)
  if (!file) throw new ProductionAssetRefusal('production.asset-path')
  const { bytes, identity } = await readAudioFile(deckDir, file, signal)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  if (declared.fingerprint && declared.fingerprint.replace(/^sha256:/, '').toLowerCase() !== sha256) throw new ProductionAssetRefusal('production.asset-fingerprint')
  const probed = await inspectProductionAudioBytes(assetId, bytes, signal)
  return { path: file, stamp: identity, extension: probed.extension, asset: probed.inspection }
}

/** Snapshot bytes are checked before a response or published copy can adopt them. */
export async function readProductionAssetFile(file: ProductionAssetFile, deckDir: string, signal?: AbortSignal): Promise<Buffer> {
  const { bytes, identity } = await readAudioFile(deckDir, file.path, signal)
  if (identity !== file.stamp || createHash('sha256').update(bytes).digest('hex') !== file.asset.sha256) throw new ProductionAssetRefusal('production.asset-changed')
  return bytes
}

export function assertProductionAssetFile(file: ProductionAssetFile, deckDir: string): void {
  const fd = openInDeck(deckDir, file.path)
  if (fd === undefined) throw new ProductionAssetRefusal('production.asset-changed')
  try { if (stamp(fstatSync(fd)) !== file.stamp) throw new ProductionAssetRefusal('production.asset-changed') }
  finally { closeSync(fd) }
}

export async function inspectProductionAssets(doc: IRDocument, deckDir: string, signal?: AbortSignal): Promise<{ assets: Map<string, ProductionAssetFile>, errors: Map<string, string> }> {
  const assets = new Map<string, ProductionAssetFile>(), errors = new Map<string, string>()
  const ids = [...new Set(doc.production?.mediaClips.map(clip => clip.assetId) ?? [])].sort()
  if (ids.length > 32) { ids.forEach(id => errors.set(id, 'production.asset-count')); return { assets, errors } }
  for (let offset = 0; offset < ids.length; offset += 2) await Promise.all(ids.slice(offset, offset + 2).map(async id => {
    try { assets.set(id, await inspectProductionAsset(doc, deckDir, id, signal)) }
    catch (error) { signal?.throwIfAborted(); if (!(error instanceof ProductionAssetRefusal)) throw error; errors.set(id, error.code) }
  }))
  if ([...assets.values()].reduce((bytes, file) => bytes + file.asset.durationMs / 1000 * 48000 * file.asset.channels * 4, 0) > 256 * 1024 * 1024) {
    ids.forEach(id => errors.set(id, 'production.asset-decoded-size')); assets.clear()
  }
  return { assets, errors }
}
