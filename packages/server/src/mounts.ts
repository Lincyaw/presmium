import { errorMessage, prefixedLogger } from '@lincyaw/kernel'
import type { Logger, ServerContext, ServerContribution, ServiceToken } from '@lincyaw/kernel'
import type { DiagnosticStore } from './diagnostics.ts'
import type { ServedDocument } from './server-host.ts'

export interface Mounted {
  doc: ServedDocument
  contributions: Map<string, ServerContribution>
}

export interface MountsOptions {
  document(dir: string): Promise<ServedDocument | undefined>
  ownService<T>(token: ServiceToken<T>): T | undefined
  settings?: Record<string, Record<string, unknown>>
  operatorDir?: string
  env: NodeJS.ProcessEnv
  diagnostics: DiagnosticStore
  log: Logger
}

/** The plugins' server contributions of each document, made when a request first names the document. */
export class Mounts {
  readonly #options: MountsOptions
  readonly #mounted = new Map<string, Promise<Mounted | undefined>>()
  readonly #tearingDown = new Map<string, Promise<void>>()
  #stopped = false

  constructor(options: MountsOptions) {
    this.#options = options
  }

  mount(dir: string): Promise<Mounted | undefined> {
    if (this.#stopped) return Promise.resolve(undefined)
    const known = this.#mounted.get(dir)
    if (known) return known
    const loading = this.#load(dir, this.#tearingDown.get(dir))
    loading.then((found) => {
      if (!found && this.#mounted.get(dir) === loading) this.#mounted.delete(dir)
    }, () => {
      if (this.#mounted.get(dir) === loading) this.#mounted.delete(dir)
    })
    this.#mounted.set(dir, loading)
    return loading
  }

  async documents(): Promise<ServedDocument[]> {
    return (await Promise.all([...this.#mounted.values()].map(known => known.catch(() => undefined)))).flatMap(m => (m ? [m.doc] : []))
  }

  async unmount(dir: string): Promise<void> {
    const known = this.#mounted.get(dir)
    this.#mounted.delete(dir)
    if (!known) return this.#tearingDown.get(dir)
    this.#options.log.debug(`unmounting the server contributions of ${dir || 'the deck'}`)
    const stopped = this.#takeDown(known).finally(() => this.#options.diagnostics.clear(dir, 'server'))
    this.#tearingDown.set(dir, stopped)
    try {
      await stopped
    } finally {
      if (this.#tearingDown.get(dir) === stopped) this.#tearingDown.delete(dir)
    }
  }

  /** Mounts nothing more: every later request for a document finds none. */
  stop(): void {
    this.#stopped = true
  }

  async close(): Promise<void> {
    this.stop()
    await Promise.all([...this.#mounted.keys()].map(dir => this.unmount(dir)))
    await Promise.all(this.#tearingDown.values())
  }

  async #load(dir: string, previous: Promise<void> | undefined): Promise<Mounted | undefined> {
    const { diagnostics, env, log } = this.#options
    await previous
    const doc = await this.#options.document(dir)
    if (!doc) return undefined
    log.debug(`mounting the server contributions of ${dir || 'the deck'}: ${doc.plugins.filter(p => p.plugin.server).map(p => p.id).join(', ') || 'none'}`)
    const contributions = new Map<string, ServerContribution>()
    for (const { id, plugin, config } of doc.plugins) {
      if (!plugin.server) continue
      const operatorDir = this.#options.operatorDir ?? doc.operatorDir
      const ctx: ServerContext = {
        deckDir: doc.deckDir,
        workspaceRoot: doc.workspaceRoot,
        config,
        settings: (this.#options.settings ?? doc.settings)?.[id] ?? {},
        lang: doc.lang,
        service: <T>(token: ServiceToken<T>) => this.#options.ownService(token) ?? doc.service(token),
        secret: name => env[name],
        ...operatorDir ? { operatorDir } : {},
        ...doc.home ? { home: true } : {},
        log: prefixedLogger(log, id),
      }
      try {
        contributions.set(id, await plugin.server.call(plugin, ctx))
        diagnostics.replace({ document: dir, origin: 'server', instance: id }, [])
      } catch (error) {
        log.error(`plugin ${id} failed to make its server contribution: ${errorMessage(error)}`)
        diagnostics.replace({ document: dir, origin: 'server', instance: id }, [{ checkId: id, severity: 'error', message: `plugin ${id} failed to make its server contribution: ${errorMessage(error)}` }])
      }
    }
    return { doc, contributions }
  }

  async #takeDown(known: Promise<Mounted | undefined>): Promise<void> {
    for (const [id, contribution] of (await known.catch(() => undefined))?.contributions ?? []) {
      try {
        await contribution.close?.()
      } catch (error) {
        this.#options.log.error(`the contribution of ${id} failed to close: ${errorMessage(error)}`)
      }
    }
  }
}
