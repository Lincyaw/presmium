/**
 * Form-neutral host contract. Plugin components depend on this package only,
 * never on @slidev/client or vitepress, so they run in both forms.
 * Implemented by @presmium/slidev-addon-core (slides) and @presmium/web (document).
 */
import type { Ref } from 'vue'
import { defineService } from '@presmium/kernel/contracts'
import type { Cursor, PresentationMode, ServiceToken, StartReport, StepRange, StepState, Unsubscribe } from '@presmium/kernel/contracts'

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

// ---------------------------------------------------------------------------
// Sync transport port (K-06): how a network transport joins the host's
// synchronized state. The slides host maps it onto Slidev's `addSyncMethod`.
// ---------------------------------------------------------------------------

/** Publishes local state; `fromRemote` is true when the change itself came from a transport. */
export type SyncPublish = (state: Readonly<Record<string, unknown>>, fromRemote: boolean) => void

export interface SyncTransport {
  /**
   * Called once for each synchronized state channel (navigation, drawings, ...).
   * Pass remote patches to `receive`; return a publisher for local changes, or
   * undefined to leave the channel alone. `persist` marks channels that survive reloads.
   */
  connect(
    channel: string,
    receive: (patch: Record<string, unknown>) => void,
    state: Readonly<Record<string, unknown>>,
    persist: boolean,
  ): SyncPublish | undefined
}

export interface SyncTransports {
  /** Connects the transport to every current and future channel; the returned function detaches it. */
  add(transport: SyncTransport): Unsubscribe
}

/** Host service of the slides form; absent in the document form. */
export const SYNC_TRANSPORTS = defineService<SyncTransports>('presmium.syncTransports')
