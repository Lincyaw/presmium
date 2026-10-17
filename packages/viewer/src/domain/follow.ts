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
import type { IRBlock, IRSection } from '@presmium/kernel'

/**
 * What takes each step of a section, by step: `<block>` a block that appears
 * at it, `<block>+<k>` a block's k-th inner state (the next list item, the
 * next highlighted lines), `<block>-` a block that disappears at it; a
 * component's child is `<component>/<child>`. Entry 0, the start, has none.
 */
export type StepKeys = string[][]

/** A position by ids, as a window reports it besides its numbers. */
export interface FollowAnchor {
  /** The section's id. */
  section?: string
  /** The keys of the steps the position has reached in it (`stepTrail`). */
  trail?: string[]
  /** For a section only some audiences have: the nearest earlier section a build without it has (`backSection`). */
  back?: string
}

/**
 * The keys of a section's steps. With `renderer`, those of that renderer's
 * view: the blocks only for other renderers are left out and the steps only
 * they took closed up, as the compiler's `viewFor` does.
 */
export function stepKeys(section: Pick<IRSection, 'blocks' | 'steps'>, renderer?: string): StepKeys {
  const keys: StepKeys = Array.from({ length: section.steps + 1 }, () => [])
  const add = (step: number, key: string) => step > 0 && keys[step]?.push(key)
  let left = false
  const visit = (blocks: readonly IRBlock[], prefix: string) => {
    for (const block of blocks) {
      if (renderer !== undefined && block.only && !block.only.includes(renderer)) {
        left = true
        continue
      }
      const id = prefix + block.id
      if (block.role === 'visual') {
        for (let k = 0; k <= (block.span ?? 0); k++) add(block.at + k, k === 0 ? id : `${id}+${k}`)
        if (block.until !== undefined) add(block.until, `${id}-`)
      }
      if (block.node.type === 'component' && block.node.children) visit(block.node.children, `${id}/`)
    }
  }
  visit(section.blocks, '')
  return left ? keys.filter((step, i) => i === 0 || step.length > 0) : keys
}

/** The keys of the steps a position at `step` has reached: those of steps 1 to `step`. */
export function stepTrail(keys: StepKeys, step: number): string[] {
  return keys.slice(1, step + 1).flat()
}

/**
 * The step of a section (by its keys) that a trail from another build
 * reaches: the last step whose keys it has, 0 when it has none. A step of
 * that build that this one does not have counts as the step before it, as
 * the compiler closes up the steps.
 */
export function trailStep(keys: StepKeys, trail: readonly string[]): number {
  const reached = new Set(trail)
  for (let step = keys.length - 1; step > 0; step--) {
    if (keys[step]!.some(key => reached.has(key))) return step
  }
  return 0
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
