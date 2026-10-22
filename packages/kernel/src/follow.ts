import type { IRSection } from './ir.ts'
import { stepTrail, trailStep } from './step-keys.ts'
import type { StepKeys } from './step-keys.ts'

/** The presenter's position by ID, so learners with another version of the document reach the same place. */
export interface FollowAnchor {
  section?: string
  trail?: string[]
  back?: string
}

const LEARNERS = 'student'

/** For a section only some audiences have: the nearest earlier section that the other versions have too. */
export function backSection(sections: readonly Pick<IRSection, 'id' | 'audience'>[], id: string): string | undefined {
  const at = sections.findIndex(section => section.id === id)
  const audience = sections[at]?.audience
  if (!audience?.length) return undefined
  const learners = !audience.includes(LEARNERS)
  return sections.slice(0, at).findLast(section => !section.audience?.length || (learners && section.audience.includes(LEARNERS)))?.id
}

/** Where a learner goes in their own version of the document when following the presenter's position. */
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
