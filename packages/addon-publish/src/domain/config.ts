import { isRecord } from '@lincyaw/kernel'

export const PUBLISH_ID = 'presmium.publish'

export interface PublishOptions {
  offline: boolean
}

export function publishOptions(headmatter: unknown): PublishOptions {
  const presmium = isRecord(headmatter) ? headmatter.presmium : undefined
  const own = isRecord(presmium) ? presmium[PUBLISH_ID] : undefined
  return { offline: !(isRecord(own) && own.offline === false) }
}

export function onInBuild(flag: unknown): boolean {
  return flag === true || flag === 'build'
}
