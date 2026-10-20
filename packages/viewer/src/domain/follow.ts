import { stepTrail, trailStep } from '@lincyaw/kernel'
import type { IRSection, StepKeys } from '@lincyaw/kernel'

export { stepKeys, stepTrail, trailStep } from '@lincyaw/kernel'
export type { StepKeys } from '@lincyaw/kernel'

export interface FollowAnchor {
  section?: string
  trail?: string[]
  back?: string
}

const LEARNERS = 'student'

export function backSection(sections: readonly Pick<IRSection, 'id' | 'audience'>[], id: string): string | undefined {
  const at = sections.findIndex(section => section.id === id)
  const audience = sections[at]?.audience
  if (!audience?.length) return undefined
  const learners = !audience.includes(LEARNERS)
  return sections.slice(0, at).findLast(section => !section.audience?.length || (learners && section.audience.includes(LEARNERS)))?.id
}

export function followedPlace(position: FollowAnchor & { step: number }, keysOf: (id: string) => StepKeys | undefined): { section: string, step: number } | undefined {
  const { section, trail, back, step } = position
  const keys = section === undefined ? undefined : keysOf(section)
  if (keys) {
    const other = trail !== undefined && stepTrail(keys, step).join('\n') !== trail.join('\n')
    return { section: section!, step: other ? trailStep(keys, trail) : step }
  }
  const before = back === undefined ? undefined : keysOf(back)
  return before && { section: back!, step: before.length - 1 }
}
