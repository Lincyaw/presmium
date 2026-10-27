import { ProductionAudioRefusal } from '@lincyaw/kernel'
import type { NodeServiceContext, ProductionAudioAuthoring } from '@lincyaw/kernel'
import { irRevision } from '@lincyaw/kernel/node'
import { placeProductionAudio } from '../domain/production-audio.ts'
import { latestDoc } from './latest-ir.ts'
import { inspectProductionAsset, inspectProductionAssets, inspectProductionAudioBytes } from './production-assets.ts'
import { productionSnapshot } from './production.ts'
import { createServedDeck, RouteRefusal } from './routes/served-deck.ts'
import { assertVoiceSource, VoiceSourceRefusal } from './voice-source.ts'

/** The workspace owns authoring and history; this service supplies real media and timing judgments. */
export function productionAudioAuthoring(ctx: NodeServiceContext): ProductionAudioAuthoring {
  const served = createServedDeck({ ...ctx, service: token => ctx.service?.(token) })
  return {
    inspectBytes: inspectProductionAudioBytes,
    async inspectAsset(asset, signal) {
      return (await inspectProductionAsset({ productionAssets: { [asset.id]: asset } }, ctx.deckDir, asset.id, signal)).asset
    },
    async readPlan(query, signal) {
      try {
        const doc = latestDoc(ctx.deckDir)
        if (!doc) throw new ProductionAudioRefusal(503, 'production-document-unavailable')
        const revision = irRevision(doc)
        if (query.irRevision !== undefined && query.irRevision !== revision) throw new ProductionAudioRefusal(409, 'production-revision-changed')
        return (await productionSnapshot(served, { source: query.source, irRevision: revision }, signal)).plan
      }
      catch (error) {
        if (error instanceof RouteRefusal) throw new ProductionAudioRefusal(error.status, error.message)
        if (error instanceof VoiceSourceRefusal) throw new ProductionAudioRefusal(409, error.message)
        throw error
      }
    },
    async validateClips(binding, clips, assets, signal) {
      try {
        const snapshot = await productionSnapshot(served, { source: binding.source, irRevision: binding.irRevision }, signal)
        if (snapshot.plan.binding.planId !== binding.planId) throw new ProductionAudioRefusal(409, 'production-plan-changed')
        const doc = latestDoc(ctx.deckDir)
        if (!doc || irRevision(doc) !== binding.irRevision) throw new ProductionAudioRefusal(409, 'production-revision-changed')
        const candidate = { ...doc, production: { defaults: {}, stepOverrides: {}, ...doc.production, mediaClips: clips }, productionAssets: assets }
        const inspected = await inspectProductionAssets(candidate, ctx.deckDir, signal)
        const placed = placeProductionAudio(candidate, snapshot.plan.pages, new Map([...inspected.assets].map(([id, file]) => [id, file.asset])), inspected.errors)
        if (placed.issues.length) throw new ProductionAudioRefusal(422, placed.issues[0]!.code)
        await assertVoiceSource(doc, ctx.deckDir, binding.source)
        if (latestDoc(ctx.deckDir) !== doc) throw new ProductionAudioRefusal(409, 'production-revision-changed')
        signal?.throwIfAborted()
      } catch (error) {
        if (error instanceof RouteRefusal) throw new ProductionAudioRefusal(error.status, error.message)
        if (error instanceof VoiceSourceRefusal) throw new ProductionAudioRefusal(409, error.message)
        throw error
      }
    },
  }
}
