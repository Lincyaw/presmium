/**
 * Steps by the blocks that take them (D-4, F-85): the full and the student
 * build of a deck, and each renderer's view of it, number the steps of a
 * section apart, but the blocks keep their ids. A window reports the keys of
 * the steps it has reached (`stepTrail`) besides its step, and a reader of
 * another numbering finds the step in its own (`trailStep`): the forms that
 * follow each other (`@presmium/viewer`'s `followedPlace`), and the agent
 * environment, which reads the whole IR (`@presmium/mcp`'s `get_position`).
 * Pure functions over the IR, without the browser runtime.
 */
import type { IRBlock, IRSection } from './ir.ts'

/**
 * What takes each step of a section, by step: `<block>` a block that appears
 * at it, `<block>+<k>` a block's k-th inner state (the next list item, the
 * next highlighted lines), `<block>-` a block that disappears at it; a
 * component's child is `<component>/<child>`. Entry 0, the start, has none.
 */
export type StepKeys = string[][]

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
 * The step of a section (by its keys) that a trail from another numbering
 * reaches: the last step whose keys it has, 0 when it has none. A step of
 * that numbering that this one does not have counts as the step before it,
 * as the compiler closes up the steps.
 */
export function trailStep(keys: StepKeys, trail: readonly string[]): number {
  const reached = new Set(trail)
  for (let step = keys.length - 1; step > 0; step--) {
    if (keys[step]!.some(key => reached.has(key))) return step
  }
  return 0
}
