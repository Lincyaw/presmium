import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { join, relative, sep } from 'node:path'
import { dev, relativeIR } from '@lincyaw/compiler'
import type { Compilation, DevServers } from '@lincyaw/compiler'
import { errorMessage, PREVIEW_REVISION, pushStream } from '@lincyaw/kernel'
import { irRevision, machineState, threadBudget } from '@lincyaw/kernel/node'
import type { MachineState } from '@lincyaw/kernel/node'
import type { Finding, IrAnswer, IRDocument, IrEvent, Logger, PreviewAnswer, PreviewRenderer, ProxySpec } from '@lincyaw/kernel'
import type { DiagnosticStore, ServerHost } from '@lincyaw/server'
import type { CompileSession } from './compile-session.ts'
import { WORKSPACE_ID } from './routes.ts'

export interface BuildAnswer {
  outputs: { renderer: string, outDir: string }[]
  findings: Finding[]
}

export interface CheckAnswer {
  findings: Finding[]
}

/** What the workbench's routes ask of the workspace server: a document's IR and its changes, its previews, builds and checks. */
export interface WorkbenchApi {
  ir(document: string): Promise<IrAnswer>
  events(document: string, signal: AbortSignal): AsyncIterable<{ event: string, data: IrEvent }>
  /**
   * The document's preview addresses, starting the dev server of `renderer`. `prefetch`: the workbench prepares the
   * document ahead of the author's click (its web form) or switch (its slides); the dev server starts only when the machine
   * has room (`roomToPrefetch`), and the answer does not tell whether it started.
   */
  preview(document: string, renderer?: PreviewRenderer, prefetch?: boolean): Promise<PreviewAnswer>
  build(document: string, to?: string[]): Promise<BuildAnswer>
  check(document: string): Promise<CheckAnswer>
  proxies: ProxySpec[]
}

function withIrRevision(doc: IRDocument, revision: string): IRDocument {
  return { ...doc, meta: { ...doc.meta, [PREVIEW_REVISION]: revision } }
}

function workspacePath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      server.close(() => resolve(port))
    })
  })
}

function urlPath(dir: string): string {
  return dir.split('/').map(encodeURIComponent).join('/')
}

function slidesPath(dir: string): string {
  return `slides/${dir ? `${urlPath(dir)}/` : ''}`
}

export interface WorkbenchBackendOptions {
  root: string
  compileSessionOf(dir: string): CompileSession
  serverHost: ServerHost
  diagnostics?: DiagnosticStore
  url(): string
  preview?: { origins: string[] }
  stateDir: string
  log: Logger
  /** Starts the web dev server of a document ahead of its first request. */
  warmSite?(dir: string): Promise<void>
}

/** The workbench's API with what the workspace server tells it: each compilation, the documents removed, closing. */
export interface WorkbenchBackend extends WorkbenchApi {
  compiled(dir: string, compilation: Compilation, changed: string[]): void
  /** The document as the site shows it, stamped with its IR revision when pages embed previews. */
  stampPreviewRevision(compilation: Compilation, doc: IRDocument): IRDocument
  documentsRemoved(dirs: string[]): Promise<void>
  close(): Promise<void>
}

// Slides started ahead of a switch: at most this many dev servers running, each with this much free memory left.
const PREFETCH_SERVERS = 2
const PREFETCH_MEMORY = 3 * 1024 ** 3

/** Whether the machine has room to start a document's slides before the author asks: idle processors and free memory. */
export function roomToPrefetch(running: number, machine: MachineState = machineState()): boolean {
  return running < PREFETCH_SERVERS && threadBudget('interactive', process.env, machine) >= 2 && machine.free >= PREFETCH_MEMORY
}

export function createWorkbenchBackend(options: WorkbenchBackendOptions): WorkbenchBackend {
  const { root, log } = options
  const irRevisions = new WeakMap<Compilation, string>()
  const relativeDocs = new WeakMap<Compilation, IRDocument>()
  const irRevisionOf = (compilation: Compilation) => {
    let known = irRevisions.get(compilation)
    if (!known) irRevisions.set(compilation, known = irRevision(compilation.doc))
    return known
  }
  const listeners = new Map<string, Set<(event: IrEvent) => void>>()
  const slidesPreviews = new Map<string, Promise<DevServers | undefined>>()
  const proxies: ProxySpec[] = []
  let closed = false

  const eventOf = (dir: string, compilation: Compilation, changed: string[]): IrEvent => {
    const count = (severity: Finding['severity']) => compilation.doc.diagnostics.filter(finding => finding.severity === severity).length
    return { document: dir, revision: irRevisionOf(compilation), diagnostics: { errors: count('error'), warnings: count('warning') }, files: changed.map(file => workspacePath(root, file)) }
  }
  const stamped = (compilation: Compilation): Compilation => (options.preview ? { ...compilation, doc: withIrRevision(compilation.doc, irRevisionOf(compilation)) } : compilation)

  const startSlidesPreview = (dir: string) => {
    let known = slidesPreviews.get(dir)
    if (!known) {
      let startupRevision: string | undefined
      known = (async () => {
        const session = options.compileSessionOf(dir)
        const compilation = await session.ready()
        startupRevision = irRevisionOf(compilation)
        const configured = Object.keys(compilation.doc.config.renderers)
        if (configured.length > 0 && !configured.includes('slides')) return undefined
        const path = slidesPath(dir)
        let startupErrors: string[] = []
        const started = await dev(session.compiler, {
          outDir: join(options.stateDir, 'preview', encodeURIComponent(dir) || '_'),
          to: ['slides'],
          compilation: stamped(compilation),
          base: `/__presmium/${WORKSPACE_ID}/${path}`,
          port: await freePort(),
          ...options.preview ? { preview: { origins: options.preview.origins } } : {},
          onCompile(compiled, findings) {
            startupErrors = findings.filter(f => f.checkId === 'presmium.render' && f.severity === 'error').map(f => f.message)
            const stampedRevision = compiled.doc.meta[PREVIEW_REVISION]
            const revision = typeof stampedRevision === 'string' ? stampedRevision : irRevisionOf(compiled)
            if (options.diagnostics?.irRevision(dir) === revision) options.diagnostics.replace({ document: dir, origin: 'preview', renderer: 'slides' }, findings.filter(f => f.checkId === 'presmium.render'), { root, irRevision: revision })
            for (const finding of findings.filter(f => f.checkId === 'presmium.render')) log.warn(`the slides' preview of ${dir || '.'}: ${finding.message}`)
          },
        })
        const server = started.servers[0]
        if (!server || closed || slidesPreviews.get(dir) !== known) {
          await started.close()
          if (!server && !closed) throw new Error(startupErrors.join('\n') || 'the slides renderer did not start a preview server')
          return undefined
        }
        const target = new URL(server.url)
        proxies.push({ path: path.replace(/\/$/, ''), target: `${target.origin}${target.pathname.replace(/\/$/, '')}` })
        proxies.sort((a, b) => b.path.length - a.path.length)
        return started
      })()
      known.then((started) => {
        if (!started && slidesPreviews.get(dir) === known) slidesPreviews.delete(dir)
      }, (error: unknown) => {
        log.warn(`the slides' preview of ${dir || '.'} did not start: ${errorMessage(error)}`)
        if (options.diagnostics && options.diagnostics.irRevision(dir) === startupRevision) options.diagnostics.replace({ document: dir, origin: 'preview', renderer: 'slides' }, [{ checkId: 'presmium.preview', severity: 'error', message: errorMessage(error) }], { irRevision: startupRevision })
        if (slidesPreviews.get(dir) === known) slidesPreviews.delete(dir)
      })
      slidesPreviews.set(dir, known)
    }
    return known
  }

  const stopSlidesPreview = async (dir: string) => {
    const known = slidesPreviews.get(dir)
    slidesPreviews.delete(dir)
    const path = slidesPath(dir).replace(/\/$/, '')
    const at = proxies.findIndex(proxy => proxy.path === path)
    if (at >= 0) proxies.splice(at, 1)
    await (await known?.catch(() => undefined))?.close()
  }

  return {
    proxies,
    async ir(document) {
      const compilation = await options.compileSessionOf(document).ready()
      let doc = relativeDocs.get(compilation)
      if (!doc) relativeDocs.set(compilation, doc = relativeIR(compilation.doc, root, root))
      return { document, revision: irRevisionOf(compilation), doc, diagnostics: doc.diagnostics }
    },
    events(document, signal) {
      const session = options.compileSessionOf(document)
      return pushStream((push) => {
        const own = listeners.get(document) ?? new Set()
        listeners.set(document, own)
        const listener = (event: IrEvent) => push({ event: 'revision', data: event })
        own.add(listener)
        if (session.latest) listener(eventOf(document, session.latest, []))
        else void session.ready().catch(() => undefined)
        return () => own.delete(listener)
      }, { signal })
    },
    async preview(document, renderer, prefetch = false) {
      const base = options.url()
      const web = `${base}/${document ? `${urlPath(document)}/` : ''}`
      const slideURL = `${base}/__presmium/${WORKSPACE_ID}/${slidesPath(document)}`
      const compilation = await options.compileSessionOf(document).ready()
      const configured = Object.keys(compilation.doc.config.renderers)
      const available = configured.length === 0 || configured.includes('slides')
      if (!available) options.diagnostics?.clear(document, 'preview', 'slides')
      if (renderer === 'web' && prefetch && roomToPrefetch(0)) void options.warmSite?.(document).catch(() => undefined)
      if (renderer === 'web' || !available) {
        return { document, web, ...available ? { slides: slideURL } : {} }
      }
      if (prefetch && renderer === 'slides' && !slidesPreviews.has(document)) {
        if (roomToPrefetch(slidesPreviews.size)) void startSlidesPreview(document).catch(() => undefined)
        return { document, web, slides: slideURL }
      }
      const own = await (renderer === 'slides' ? startSlidesPreview(document) : startSlidesPreview(document).catch(() => undefined))
      return { document, web, ...own ? { slides: slideURL } : {} }
    },
    async build(document, to) {
      return await options.serverHost.build(document, to ? { to } : {})
    },
    async check(document) {
      return { findings: await options.serverHost.check(document) }
    },
    compiled(dir, compilation, changed) {
      const event = eventOf(dir, compilation, changed)
      for (const listener of listeners.get(dir) ?? []) listener(event)
      const configured = Object.keys(compilation.doc.config.renderers)
      if (configured.length > 0 && !configured.includes('slides')) {
        options.diagnostics?.clear(dir, 'preview', 'slides')
        void stopSlidesPreview(dir).catch((error: unknown) => log.warn(`the slides' preview of ${dir || '.'} did not stop: ${errorMessage(error)}`))
        return
      }
      const known = slidesPreviews.get(dir)
      if (known) void known.then(started => started?.update(stamped(compilation))).catch((error: unknown) => log.warn(`the slides' preview of ${dir || '.'} did not update: ${errorMessage(error)}`))
    },
    stampPreviewRevision(compilation, doc) {
      return options.preview ? withIrRevision(doc, irRevisionOf(compilation)) : doc
    },
    async documentsRemoved(dirs) {
      for (const dir of dirs) {
        await stopSlidesPreview(dir)
        options.diagnostics?.forget(dir)
      }
    },
    async close() {
      closed = true
      for (const dir of [...slidesPreviews.keys()]) await stopSlidesPreview(dir)
    },
  }
}
