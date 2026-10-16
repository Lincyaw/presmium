import { isRecord } from '@presmium/kernel'

/** Id under which this addon reads its options from the `presmium` config. */
export const PUBLISH_ID = 'presmium.publish'

export interface PublishOptions {
  /** Service worker precache and remote asset bundling in `slidev build` (default true). */
  offline: boolean
}

/** Options from the headmatter: `presmium: { presmium.publish: { offline: false } }`. */
export function publishOptions(headmatter: unknown): PublishOptions {
  const presmium = isRecord(headmatter) ? headmatter.presmium : undefined
  const own = isRecord(presmium) ? presmium[PUBLISH_ID] : undefined
  return { offline: !(isRecord(own) && own.offline === false) }
}

/** Whether a Slidev feature flag (`pwa`, `remoteAssets`: boolean | 'dev' | 'build') is on in builds. */
export function onInBuild(flag: unknown): boolean {
  return flag === true || flag === 'build'
}
