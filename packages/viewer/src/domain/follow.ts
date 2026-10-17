/**
 * Following across builds (D-4, F-85). The full and the student build of a
 * deck number their sections and steps apart: the student build leaves out
 * what is only for teachers and closes up the steps (docs/ir.md 2.11). Section
 * and block ids are the same in both, so a window also names its position by
 * them (`FollowAnchor`), and a window of the other build finds that place in
 * its own numbers (`followedPlace`). Both forms use these functions: the web
 * form on its IR, the slides form on what the core plugin's pass writes into
 * each slide's frontmatter.
 */
import { stepTrail, trailStep } from '@presmium/kernel'
import type { IRSection, StepKeys } from '@presmium/kernel'

/** The step keys of a section, shared with `@presmium/mcp` (which may not import the viewer). */
export { stepKeys, stepTrail, trailStep } from '@presmium/kernel'
export type { StepKeys } from '@presmium/kernel'

/** A position by ids, as a window reports it besides its numbers. */
export interface FollowAnchor {
  /** The section's id. */
  section?: string
  /** The keys of the steps the position has reached in it (`stepTrail`). */
  trail?: string[]
  /** For a section only some audiences have: the nearest earlier section a build without it has (`backSection`). */
  back?: string
}

/** The audience of the learners' build (`presmium build --audience student`), whose windows follow a presenter's. */
const LEARNERS = 'student'

/**
 * Where a window whose build lacks section `id` (one only for some
 * audiences) goes instead: the nearest earlier section its build has. For a
 * section the learners' build lacks (a teachers' one), that is the nearest
 * earlier section with no `audience` or one for the learners, a section only
 * for them included (F-85); for a section only some audiences have, the
 * learners among them, the nearest earlier one every build has. Undefined
 * for a section every build has.
 */
export function backSection(sections: readonly Pick<IRSection, 'id' | 'audience'>[], id: string): string | undefined {
  const at = sections.findIndex(section => section.id === id)
  const audience = sections[at]?.audience
  if (!audience?.length) return undefined
  const learners = !audience.includes(LEARNERS)
  return sections.slice(0, at).findLast(section => !section.audience?.length || (learners && section.audience.includes(LEARNERS)))?.id
}

/**
 * Where a window goes for a position of another window, which may be of the
 * other build: the section of its id, at the step its trail reaches (its own
 * step when it has no trail, or the trail this build has up to that step);
 * when this build lacks that section, the last step of the section `back`
 * names; undefined when it has neither. `keysOf` gives the keys of a section
 * of this build by id, undefined for one it lacks.
 */
export function followedPlace(position: FollowAnchor & { step: number }, keysOf: (id: string) => StepKeys | undefined): { section: string, step: number } | undefined {
  const { section, trail, back, step } = position
  const keys = section === undefined ? undefined : keysOf(section)
  if (keys) {
    // A trail this build has up to the step is one of the same build: the step stands.
    const other = trail !== undefined && stepTrail(keys, step).join('\n') !== trail.join('\n')
    return { section: section!, step: other ? trailStep(keys, trail) : step }
  }
  const before = back === undefined ? undefined : keysOf(back)
  return before && { section: back!, step: before.length - 1 }
}
