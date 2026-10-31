import { createHash } from 'node:crypto'
import { stat } from 'node:fs/promises'
import type { CanonicalSource, IRDocument, ProductionAssetAnswer, ProductionAssetQuery, ProductionAudio, ProductionMediaQuery, ProductionPlan, ProductionPlanQuery } from '@lincyaw/kernel'
import { irRevision } from '@lincyaw/kernel/node'
import type { LectureTrack } from '../domain/index.ts'
import { projectProductionPlan } from '../domain/production.ts'
import { latestDoc, lectureView } from './latest-ir.ts'
import { assertVoiceSource } from './voice-source.ts'
import { synthesizeLecture } from './synthesize.ts'
import type { SynthesizedClip } from './synthesize.ts'
import type { ServedDeck } from './routes/served-deck.ts'
import { RouteRefusal } from './routes/served-deck.ts'
import { assertProductionAssetFile, inspectProductionAsset } from './production-assets.ts'
import type { ProductionAssetFile } from './production-assets.ts'

interface ClipFile { audio?: ProductionAudio, asset?: ProductionAssetFile, path: string, stamp: string }
export interface ProductionSnapshot { plan: ProductionPlan, track: LectureTrack, clips: Map<string, ClipFile> }
const recent = new WeakMap<ServedDeck, Map<string, ProductionSnapshot>>()
const fileStamp = async (path: string) => { const value = await stat(path); return [value.dev, value.ino, value.size, value.mtimeMs, value.ctimeMs].join(':') }

async function clipFile(clip: SynthesizedClip, signal?: AbortSignal): Promise<ClipFile> {
  signal?.throwIfAborted()
  const before = await fileStamp(clip.path)
  if (before !== clip.stamp || !clip.sha256) throw new RouteRefusal(409, 'production-media-changed')
  return { audio: { clipId: clip.key, key: clip.key, sha256: clip.sha256, durationMs: Math.round(clip.duration * 1000) }, path: clip.path, stamp: before }
}

async function current(served: ServedDeck, expected?: ProductionPlanQuery): Promise<{ doc: IRDocument, source: CanonicalSource, revision: string }> {
  const doc = latestDoc(served.deckDir)
  if (!doc) throw new RouteRefusal(503, 'production-document-unavailable')
  const source = await assertVoiceSource(doc, served.deckDir, expected?.source), revision = irRevision(doc)
  if (latestDoc(served.deckDir) !== doc || expected && expected.irRevision !== revision) throw new RouteRefusal(409, 'production-revision-changed')
  return { doc, source, revision }
}

/** Cache-only derivation shared by the public plan and the existing lecture player. No provider generation occurs. */
export async function productionSnapshot(served: ServedDeck, query?: ProductionPlanQuery & { planId?: string }, signal?: AbortSignal): Promise<ProductionSnapshot> {
  signal?.throwIfAborted()
  const now = await current(served, query)
  if (query?.planId) {
    const found = recent.get(served)?.get(query.planId)
    // A source-bound Node service and a route can borrow different ServedDecks.
    // Re-derive only the current cache-only snapshot; never invent a past plan.
    if (!found) {
      const fresh = await productionSnapshot(served, { source: now.source, irRevision: now.revision }, signal)
      if (fresh.plan.binding.planId !== query.planId) throw new RouteRefusal(409, 'production-plan-changed')
      return fresh
    }
    if (found.plan.binding.irRevision !== now.revision) throw new RouteRefusal(409, 'production-plan-changed')
    await Promise.all([...found.clips.values()].map(async file => { if (file.asset) assertProductionAssetFile(file.asset, served.deckDir); else if (await fileStamp(file.path) !== file.stamp) throw new RouteRefusal(409, 'production-media-changed') }))
    await current(served, found.plan.binding)
    signal?.throwIfAborted()
    return found
  }
  let speech
  try { speech = served.speech() } catch { /* Explicit silence requires no speech service. */ }
  const made = await synthesizeLecture(lectureView(now.doc), served.deckDir, speech, signal, { cacheOnly: true }), track = made.preview
  if (!track) throw new RouteRefusal(409, 'production-plan-unavailable')
  const clips = new Map<string, ClipFile>(), unique = [...new Map([...made.clips.values()].map(clip => [clip.key, clip])).values()].sort((a, b) => a.key.localeCompare(b.key))
  for (let offset = 0; offset < unique.length; offset += 4) for (const file of await Promise.all(unique.slice(offset, offset + 4).map(clip => clipFile(clip, signal)))) clips.set(file.audio!.clipId, file)
  for (const file of [...made.assets?.values() ?? []].sort((a, b) => a.asset.mediaId.localeCompare(b.asset.mediaId))) {
    assertProductionAssetFile(file, served.deckDir)
    clips.set(file.asset.mediaId, { asset: file, path: file.path, stamp: file.stamp })
  }
  for (const utterance of track.utterances) {
    const clip = made.clips.get(utterance.id)
    if (clip) utterance.clipId = clip.key
  }
  const projected = projectProductionPlan(now.doc, made.deck.plan, track, new Map([...clips].flatMap(([key, file]) => file.audio ? [[key, file.audio] as const] : [])), made.failures, [...made.mediaDiagnostics ?? [], ...made.captionDiagnostics ?? []], new Map([...made.assets ?? []].map(([id, file]) => [id, file.asset])))
  const planId = createHash('sha256').update(JSON.stringify({ source: now.source, irRevision: now.revision, projected, track, audio: [...clips.values()].map(file => file.audio ?? file.asset!.asset) })).digest('hex').slice(0, 32)
  const binding = { source: now.source, irRevision: now.revision, planId }, plan: ProductionPlan = { binding, ...projected }
  track.binding = binding
  await current(served, binding)
  signal?.throwIfAborted()
  const snapshot = { plan, track, clips }, plans = recent.get(served) ?? new Map<string, ProductionSnapshot>()
  recent.set(served, plans); plans.set(planId, snapshot)
  while (plans.size > 4) plans.delete(plans.keys().next().value!)
  return snapshot
}

export async function productionAsset(served: ServedDeck, query: ProductionAssetQuery, signal?: AbortSignal): Promise<ProductionAssetAnswer> {
  const now = await current(served, query), inspected = await inspectProductionAsset(now.doc, served.deckDir, query.assetId, signal)
  await current(served, { source: now.source, irRevision: now.revision })
  signal?.throwIfAborted()
  return { source: now.source, irRevision: now.revision, asset: inspected.asset }
}

/**
 * The file a clip plays, in the deck. A production asset was read and hashed when the snapshot was made; it is the same
 * file while its stamp is, and its hash tags it, so a reader who has it is answered without reading it again.
 */
export async function productionMedia(served: ServedDeck, query: ProductionMediaQuery, signal?: AbortSignal): Promise<{ path: string, etag?: string, mediaType?: string }> {
  const snapshot = await productionSnapshot(served, query, signal), file = snapshot.clips.get(query.clipId)
  if (!file) throw new RouteRefusal(404, 'production-clip-unknown')
  if (file.asset) {
    assertProductionAssetFile(file.asset, served.deckDir)
    await current(served, query); signal?.throwIfAborted()
    return { path: file.asset.path, etag: `"${file.asset.asset.sha256}"`, mediaType: file.asset.asset.mediaType }
  }
  const hit = await served.speech().cached?.(query.clipId, signal)
  if (!hit || typeof hit.audio !== 'string' || hit.audio !== file.path || Math.round(hit.duration * 1000) !== file.audio!.durationMs) throw new RouteRefusal(409, 'production-media-changed')
  if (await fileStamp(file.path) !== file.stamp) throw new RouteRefusal(409, 'production-media-changed')
  await current(served, query)
  signal?.throwIfAborted()
  return { path: file.path }
}
