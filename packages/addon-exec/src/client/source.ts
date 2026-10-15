import type { StepState } from '@presmium/kernel'
import type { InjectionKey, Ref } from 'vue'

/**
 * The source of the code block a component wraps. The block is rendered by the
 * host's Markdown (Shiki in both forms), so the source is read back from it.
 */
export function slotSource(container: HTMLElement | undefined): string {
  return container?.querySelector('code')?.textContent ?? ''
}

/** Marks the line rendered for `line` (1-based) in the wrapped code block; undefined clears the mark. */
export function markLine(container: HTMLElement | undefined, line: number | undefined, className: string): void {
  container?.querySelectorAll('code .line').forEach((el, i) => el.classList.toggle(className, i + 1 === line))
}

/** Arguments as strings, the form of `RunRequest.args`. */
export function stringArgs(params: Record<string, unknown> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(params ?? {}).map(([name, value]) => [name, String(value)]))
}

/** Lets step marks report their step state to the component that renders them. */
export type RegisterStepMark = (at: number, state: Readonly<Ref<StepState>>) => () => void

export const STEP_MARKS: InjectionKey<RegisterStepMark> = Symbol('presmium.exec.stepMarks')
