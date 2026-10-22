import { errorMessage } from '@lincyaw/kernel'
import type { Diagnostic, DiagnosticSnapshot, PreviewDiagnostics } from '@lincyaw/kernel'
import type { WorkbenchStore } from './workbench.ts'
import type { WorkspaceClient } from './workspace-client.ts'

type Repairer = (diagnostics: readonly Diagnostic[]) => void | Promise<void>

/**
 * The open document's current diagnostics: the snapshots the workspace server pushes (marked unavailable while the
 * stream fails), the preview's runtime findings reported to it, and the repair the conversation is asked for.
 */
export class DocumentDiagnostics {
  readonly #client: WorkspaceClient
  readonly #store: WorkbenchStore
  readonly #repairers = new Set<Repairer>()
  #unsubscribe?: () => void
  #scope = 0
  #repairRequest = 0
  #reporting: Promise<void> = Promise.resolve()

  constructor(client: WorkspaceClient, store: WorkbenchStore) {
    this.#client = client
    this.#store = store
  }

  subscribe(dir: string): void {
    const scope = this.#scope
    let streamFailed = false
    let liveReceived = false
    const current = () => scope === this.#scope && this.#store.state.document === dir
    const received = (diagnostics: DiagnosticSnapshot, live = false) => {
      if (!current() || (!live && liveReceived)) return
      if (live) {
        liveReceived = true
        streamFailed = false
      }
      this.#store.set({ diagnostics, isDiagnosticsUnavailable: streamFailed })
    }
    const failed = () => {
      streamFailed = true
      if (current() && !this.#store.state.isDiagnosticsUnavailable) this.#store.set({ isDiagnosticsUnavailable: true })
    }
    this.#unsubscribe = this.#client.subscribeDiagnostics(dir, snapshot => received(snapshot, true), failed)
    void this.#client.readDiagnostics(dir).then(snapshot => received(snapshot), () => {
      if (current() && !this.#store.state.diagnostics && !this.#store.state.isDiagnosticsUnavailable) this.#store.set({ isDiagnosticsUnavailable: true })
    })
  }

  retry(): void {
    const document = this.#store.state.document
    if (document === undefined) return
    this.#unsubscribe?.()
    this.#scope++
    this.subscribe(document)
  }

  /** Tells the workspace server a preview's runtime findings, one report at a time. */
  reportPreview(report: PreviewDiagnostics): Promise<void> {
    const scope = this.#scope
    this.#reporting = this.#reporting.then(async () => {
      try {
        await this.#client.reportDiagnostics(report)
      } catch {
        if (scope === this.#scope && this.#store.state.document === report.document && !this.#store.state.isDiagnosticsUnavailable) this.#store.set({ isDiagnosticsUnavailable: true })
      }
    })
    return this.#reporting
  }

  onRepair(repairer: Repairer): () => void {
    this.#repairers.add(repairer)
    this.#store.set({ canRepairDiagnostics: true })
    return () => {
      this.#repairers.delete(repairer)
      this.#store.set({ canRepairDiagnostics: this.#repairers.size > 0 })
    }
  }

  async requestRepair(): Promise<void> {
    const { state } = this.#store
    const diagnostics = state.diagnostics?.diagnostics
    if (!diagnostics?.length || this.#repairers.size === 0 || state.isRepairingDiagnostics || state.isDiagnosticsUnavailable) return
    const request = ++this.#repairRequest
    this.#store.set({ isRepairingDiagnostics: true, diagnosticsRepairFailure: undefined })
    try {
      await Promise.all([...this.#repairers].map(repairer => repairer(diagnostics)))
    } catch (error) {
      if (request === this.#repairRequest) this.#store.set({ diagnosticsRepairFailure: errorMessage(error) })
    } finally {
      if (request === this.#repairRequest) this.#store.set({ isRepairingDiagnostics: false })
    }
  }

  /** Stops following the document; reports and repairs still under way no longer change the state. */
  stop(): void {
    this.#repairRequest++
    this.#unsubscribe?.()
    this.#unsubscribe = undefined
    this.#scope++
  }

  dispose(): void {
    this.stop()
    this.#repairers.clear()
  }
}
