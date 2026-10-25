import type { IrAnswer } from '@lincyaw/kernel'
import type { WorkspaceClient } from './workspace-client.ts'

/** Source writes and filesystem compilation finish independently; source maps need the newer IR. */
export function waitForSourceRevision(client: WorkspaceClient, document: string, revision: string): Promise<IrAnswer> {
  return new Promise((resolve, reject) => {
    let finished = false
    let delay = 50
    let retry: ReturnType<typeof setTimeout> | undefined
    const finish = (answer?: IrAnswer, error?: unknown) => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      clearTimeout(retry)
      if (answer) resolve(answer)
      else reject(error)
    }
    const timeout = setTimeout(() => finish(undefined, new Error('source-refresh')), 20_000)
    const read = async () => {
      try {
        const answer = await client.readIr(document)
        if (finished) return
        if (answer.revision !== revision) return finish(answer)
        retry = setTimeout(() => void read(), delay)
        delay = Math.min(500, delay * 2)
      } catch (error) { finish(undefined, error) }
    }
    // Reuse the client's conditional reads. A save must not add another long-lived
    // EventSource beside the workbench's IR, diagnostics, jobs and review streams.
    void read()
  })
}
