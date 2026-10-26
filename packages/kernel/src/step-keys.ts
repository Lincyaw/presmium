import type { IRBlock, IRSection } from './ir.ts'

export type StepKeys = string[][]

export function stepKeys(section: Pick<IRSection, 'blocks' | 'steps' | 'stepIds'>, renderer?: string): StepKeys {
  if (section.stepIds) return section.stepIds.map(id => [`step:${id}`])
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

export function stepTrail(keys: StepKeys, step: number): string[] {
  return keys.slice(1, step + 1).flat()
}

export function trailStep(keys: StepKeys, trail: readonly string[]): number {
  const reached = new Set(trail)
  for (let step = keys.length - 1; step > 0; step--) {
    if (keys[step]!.some(key => reached.has(key))) return step
  }
  return 0
}
