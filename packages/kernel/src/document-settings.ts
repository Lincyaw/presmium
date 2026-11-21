import type { DocumentDefaults, DocumentMetadata, EffectiveSettings, JsonObject, PresmiumDocument, Production } from './contracts/document.ts'
import { DEFAULT_LANG } from './contracts/locale.ts'

/** A document whose inherited settings are filled in; `metadata.lang` is always set. */
export type EffectiveDocument = PresmiumDocument & { metadata: DocumentMetadata & { lang: string } }

const plain = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Objects merge key by key; arrays and scalars are replaced; the later (nearer) value wins at every leaf. */
function deepMerge<T>(base: T | undefined, near: T | undefined): T | undefined {
  if (near === undefined) return base === undefined ? undefined : structuredClone(base)
  if (!plain(base) || !plain(near)) return structuredClone(near)
  const merged: Record<string, unknown> = structuredClone(base)
  for (const [key, value] of Object.entries(near)) merged[key] = deepMerge(merged[key], value)
  return merged as T
}

const ownSettings = (document: PresmiumDocument): DocumentDefaults => {
  const { lang, plugins, presmium, renderers, execute, checks } = document.metadata
  return { lang, plugins, presmium, renderers, execute, checks, production: { defaults: document.production.defaults, captions: document.production.captions } }
}

/**
 * The effective settings of the last document of `chain` (root ancestor first, the document itself last),
 * rooted at the workspace `defaults`: `lang`, `plugins` and the caption style take the nearest value; `presmium`,
 * `renderers`, `execute` and `checks` merge deeply; the production defaults merge field by field.
 */
export function effectiveSettings(chain: readonly PresmiumDocument[], defaults: DocumentDefaults = {}): EffectiveSettings {
  let result: DocumentDefaults = {}
  for (const layer of [defaults, ...chain.map(ownSettings)]) {
    if (layer.lang !== undefined) result.lang = layer.lang
    if (layer.plugins !== undefined) result.plugins = [...layer.plugins]
    for (const key of ['presmium', 'renderers', 'execute', 'checks'] as const) {
      const merged = deepMerge<unknown>(result[key], layer[key])
      if (merged !== undefined) (result as Record<string, unknown>)[key] = merged
    }
    const production = layer.production
    if (production?.defaults !== undefined) result.production = { ...result.production, defaults: { ...result.production?.defaults, ...structuredClone(production.defaults) } }
    if (production?.captions !== undefined) result.production = { ...result.production, captions: structuredClone(production.captions) }
    result = { ...result }
  }
  return { ...result, lang: result.lang ?? DEFAULT_LANG }
}

/** The document with its inherited settings filled in; `ancestors` is root first, the parent last. Not for saving. */
export function withEffectiveSettings(document: PresmiumDocument, ancestors: readonly PresmiumDocument[], defaults: DocumentDefaults = {}): EffectiveDocument {
  const settings = effectiveSettings([...ancestors, document], defaults)
  const metadata: DocumentMetadata & { lang: string } = { ...document.metadata, lang: settings.lang }
  if (settings.plugins !== undefined) metadata.plugins = settings.plugins
  for (const key of ['presmium', 'renderers'] as const) if (settings[key] !== undefined) metadata[key] = settings[key] as Record<string, JsonObject>
  if (settings.execute !== undefined) metadata.execute = settings.execute
  if (settings.checks !== undefined) metadata.checks = settings.checks
  const production: Production = { ...document.production, defaults: settings.production?.defaults ?? document.production.defaults }
  if (settings.production?.captions !== undefined) production.captions = settings.production.captions
  return { ...document, metadata, production }
}

/** The inherited settings of a document whose settings are already filled in. */
export function documentSettings(document: EffectiveDocument): EffectiveSettings {
  const { lang, plugins, presmium, renderers, execute, checks } = document.metadata
  const { defaults, captions } = document.production
  return { lang, ...plugins ? { plugins } : {}, ...presmium ? { presmium } : {}, ...renderers ? { renderers } : {}, ...execute ? { execute } : {}, ...checks ? { checks } : {}, production: { defaults, ...captions ? { captions } : {} } }
}
