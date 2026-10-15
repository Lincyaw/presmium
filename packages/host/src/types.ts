/**
 * Form-neutral host contract. Plugin components depend on this package only,
 * never on @slidev/client or vitepress, so they run in both forms.
 * Implemented by @presmium/slidev-addon-core (slides) and @presmium/web (document).
 */
import type { Ref } from 'vue'
import type { Cursor, PresentationMode, ServiceToken, StartReport, StepRange, StepState } from '@presmium/kernel/contracts'

export type ViewRole = 'audience' | 'presenter' | 'reader'

export interface HostAdapter {
  readonly mode: PresentationMode
  /** Must be called inside a component setup. */
  useCursor(): Readonly<Ref<Cursor>>
  /** Must be called inside a component setup. */
  useStepState(range: StepRange): Readonly<Ref<StepState>>
  /** Must be called inside a component setup. */
  useViewRole(): Readonly<Ref<ViewRole>>
  getService<T>(token: ServiceToken<T>): T | undefined
  /** Kernel start report, available after the kernel has started. */
  startReport(): StartReport | undefined
}
