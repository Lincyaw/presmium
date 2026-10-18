/**
 * The workspace service's interface for a workbench (docs/design-dsh.md
 * section 5, WP-96a): a document's IR with its revision and diagnostics
 * (`ir`), the revisions as they come (`ir/events`, SSE), the addresses of
 * its previews (`preview`), and its build and check (`build`, `check`).
 *
 * A revision names one IR: a hash of the compilation's document. The
 * workspace service gives it to the dev servers of its previews in the IR's
 * `meta` (`PREVIEW_REVISION`), so a page says which IR it shows. The web
 * form is the workspace site's page of the document, through the service;
 * the slides are a Slidev dev server per document, started when its preview
 * is first asked for, from the document's compilations (one compilation for
 * every form), under `/__presmium/presmium.workspace/slides/<dir>/` of the
 * service (a proxy of the workspace's routes), so every preview has the
 * service's origin.
 */
import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { join, relative, sep } from 'node:path'
import { dev, relativeIR } from '@presmium/compiler'
import type { Compilation } from '@presmium/compiler'
import { errorMessage, PREVIEW_REVISION } from '@presmium/kernel'
import type { Finding, IRDocument, Logger, ProxySpec } from '@presmium/kernel'
import type { ServerHost } from '@presmium/server'
import { WORKSPACE_ID } from '../domain/api.ts'
import type { DocumentSession } from './session.ts'

/** `GET ir`: the document's IR (paths relative to the workspace root), its revision and its diagnostics. */
export interface IrAnswer {
  document: string
  revision: string
  doc: IRDocument
  diagnostics: Finding[]
}

/** An event of `GET ir/events` (`event: revision`): a compilation, its diagnostics by severity, and the files (relative to the workspace root) whose change made it. */
export interface IrEvent {
  document: string
  revision: string
  diagnostics: { errors: number, warnings: number }
  files: string[]
}

/** `GET preview`: the address of each form's preview of the document; its pages have the preview agent (headless). */
export interface PreviewAnswer {
  document: string
  web: string
  slides?: string
}

/** `POST build`: what was built (outside the document) and the findings. */
export interface BuildAnswer {
  outputs: { renderer: string, outDir: string }[]
  findings: Finding[]
}

/** `POST check`: the diagnostics and the plugins' checks. */
export interface CheckAnswer {
  findings: Finding[]
}

/** What the workspace's routes ask of the service (./routes.ts). */
export interface WorkspaceService {
  ir(document: string): Promise<IrAnswer>
  events(document: string, signal: AbortSignal): AsyncIterable<{ event: string, data: IrEvent }>
  preview(document: string): Promise<PreviewAnswer>
  build(document: string, to?: string[]): Promise<BuildAnswer>
  check(document: string): Promise<CheckAnswer>
  /** The proxies of the slides' previews, under the workspace's routes. */
  proxies: ProxySpec[]
}

/** The revision of a compilation's IR. */
export function irRevision(doc: IRDocument): string {
  return createHash('sha256').update(JSON.stringify(doc)).digest('hex').slice(0, 16)
}

/** A document's IR with its revision in its `meta`, as the previews' dev servers get it. */
export function withRevision(doc: IRDocument, revision: string): IRDocument {
  return { ...doc, meta: { ...doc.meta, [PREVIEW_REVISION]: revision } }
}

/** A path of the workspace as the routes give it: relative to the root, with `/`. */
function workspacePath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}

/** A free port on this machine, for a dev server. */
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

/** A document's directory as a URL path. */
function urlPath(dir: string): string {
  return dir.split('/').map(encodeURIComponent).join('/')
}

/** The path of a document's slides preview under the workspace's routes. */
function slidesPath(dir: string): string {
  return `slides/${dir ? `${urlPath(dir)}/` : ''}`
}

export interface ServiceOptions {
  root: string
  /** The session of a document (compiled on demand). */
  sessionOf(dir: string): DocumentSession
  serverHost: ServerHost
  /** The service's address, which every preview has. */
  url(): string
  /** The workbench's origins (`--preview-origin`): the previews' pages have the agent for them; none without the headless mode. */
  preview?: { origins: string[] }
  /** Where the slides' previews keep their generated decks: outside the workspace. */
  stateDir: string
  log: Logger
}

export interface Service extends WorkspaceService {
  /** A compilation of a document: its revision, its events, its slides' preview. */
  compiled(dir: string, compilation: Compilation, changed: string[]): void
  /** A document's IR for the site's dev server: with its revision when the pages have previews. */
  siteDoc(compilation: Compilation, doc: IRDocument): IRDocument
  /** The documents gone: their slides' previews stop. */
  removed(dirs: string[]): Promise<void>
  close(): Promise<void>
}

export function workspaceService(options: ServiceOptions): Service {
  const { root, log } = options
  const revisions = new WeakMap<Compilation, string>()
  const revisionOf = (compilation: Compilation) => {
    let known = revisions.get(compilation)
    if (!known) revisions.set(compilation, known = irRevision(compilation.doc))
    return known
  }
  const listeners = new Map<string, Set<(event: IrEvent) => void>>()
  const slides = new Map<string, Promise<{ update(compilation: Compilation): Promise<void>, close(): Promise<void> } | undefined>>()
  const proxies: ProxySpec[] = []
  let closed = false

  const eventOf = (dir: string, compilation: Compilation, changed: string[]): IrEvent => {
    const count = (severity: Finding['severity']) => compilation.doc.diagnostics.filter(finding => finding.severity === severity).length
    return { document: dir, revision: revisionOf(compilation), diagnostics: { errors: count('error'), warnings: count('warning') }, files: changed.map(file => workspacePath(root, file)) }
  }
  const stamped = (compilation: Compilation): Compilation => (options.preview ? { ...compilation, doc: withRevision(compilation.doc, revisionOf(compilation)) } : compilation)

  /** The slides' preview of a document: started on first request, from its session's compilations; none without a slides form. */
  const slidesOf = (dir: string) => {
    let known = slides.get(dir)
    if (!known) {
      known = (async () => {
        const session = options.sessionOf(dir)
        const compilation = await session.ready()
        const configured = Object.keys(compilation.doc.config.renderers)
        if (configured.length > 0 && !configured.includes('slides')) return undefined
        const path = slidesPath(dir)
        const started = await dev(session.compiler, {
          outDir: join(options.stateDir, 'preview', encodeURIComponent(dir) || '_'),
          to: ['slides'],
          compilation: stamped(compilation),
          base: `/__presmium/${WORKSPACE_ID}/${path}`,
          port: await freePort(),
          // On the service's origin: the pages' `/__presmium/` requests reach the service itself.
          preview: { origins: options.preview?.origins ?? [] },
          onCompile(_compilation, findings) {
            for (const finding of findings.filter(f => f.checkId === 'presmium.render')) log.warn(`the slides' preview of ${dir || '.'}: ${finding.message}`)
          },
        })
        const server = started.servers[0]
        if (!server || closed) {
          await started.close()
          return undefined
        }
        // The longest paths first: a document's directory may lie in another's.
        const target = new URL(server.url)
        proxies.push({ path: path.replace(/\/$/, ''), target: `${target.origin}${target.pathname.replace(/\/$/, '')}` })
        proxies.sort((a, b) => b.path.length - a.path.length)
        return started
      })()
      known.catch((error: unknown) => {
        log.warn(`the slides' preview of ${dir || '.'} did not start: ${errorMessage(error)}`)
        slides.delete(dir)
      })
      slides.set(dir, known)
    }
    return known
  }

  const stop = async (dir: string) => {
    const known = slides.get(dir)
    slides.delete(dir)
    const path = slidesPath(dir).replace(/\/$/, '')
    const at = proxies.findIndex(proxy => proxy.path === path)
    if (at >= 0) proxies.splice(at, 1)
    await (await known?.catch(() => undefined))?.close()
  }

  return {
    proxies,
    async ir(document) {
      const compilation = await options.sessionOf(document).ready()
      const doc = relativeIR(compilation.doc, root, root)
      return { document, revision: revisionOf(compilation), doc, diagnostics: doc.diagnostics }
    },
    events(document, signal) {
      const waiting: IrEvent[] = []
      let wake: (() => void) | undefined
      const listener = (event: IrEvent) => {
        waiting.push(event)
        wake?.()
      }
      const own = listeners.get(document) ?? new Set()
      listeners.set(document, own.add(listener))
      const done = () => own.delete(listener)
      signal.addEventListener('abort', () => {
        done()
        wake?.()
      }, { once: true })
      // The revision now, when the document has compiled, comes first.
      const latest = options.sessionOf(document).latest
      if (latest) waiting.push(eventOf(document, latest, []))
      return {
        async* [Symbol.asyncIterator]() {
          try {
            while (!signal.aborted) {
              const next = waiting.shift()
              if (next) {
                yield { event: 'revision', data: next }
                continue
              }
              await new Promise<void>(resolve => wake = resolve)
              wake = undefined
            }
          } finally {
            done()
          }
        },
      }
    },
    async preview(document) {
      const base = options.url()
      const web = `${base}/${document ? `${urlPath(document)}/` : ''}`
      const own = await slidesOf(document)
      return { document, web, ...own ? { slides: `${base}/__presmium/${WORKSPACE_ID}/${slidesPath(document)}` } : {} }
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
      const known = slides.get(dir)
      if (known) void known.then(started => started?.update(stamped(compilation))).catch((error: unknown) => log.warn(`the slides' preview of ${dir || '.'} did not update: ${errorMessage(error)}`))
    },
    siteDoc(compilation, doc) {
      return options.preview ? withRevision(doc, revisionOf(compilation)) : doc
    },
    async removed(dirs) {
      for (const dir of dirs) await stop(dir)
    },
    async close() {
      closed = true
      for (const dir of [...slides.keys()]) await stop(dir)
    },
  }
}
