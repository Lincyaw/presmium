import { isRecord } from '@lincyaw/kernel'

export const PUBLISH_ID = 'presmium.publish'

export interface PublishOptions {
  offline: boolean
}

export function toPublishOptions(headmatter: unknown): PublishOptions {
  const presmium = isRecord(headmatter) ? headmatter.presmium : undefined
  const own = isRecord(presmium) ? presmium[PUBLISH_ID] : undefined
  return { offline: !(isRecord(own) && own.offline === false) }
}

/** Whether Slidev turns this on in a build by itself: the deck's `pwa` or `remoteAssets` is `true` or `'build'`. */
export function slidevEnablesInBuild(flag: unknown): boolean {
  return flag === true || flag === 'build'
}
