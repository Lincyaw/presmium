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

export interface IrAnswer {
  document: string
  revision: string
  doc: IRDocument
  diagnostics: Finding[]
}

export interface IrEvent {
  document: string
  revision: string
  diagnostics: { errors: number, warnings: number }
  files: string[]
}

export interface PreviewAnswer {
  document: string
  web: string
  slides?: string
}

export interface BuildAnswer {
  outputs: { renderer: string, outDir: string }[]
  findings: Finding[]
}

export interface CheckAnswer {
  findings: Finding[]
}

export interface WorkspaceService {
  ir(document: string): Promise<IrAnswer>
  events(document: string, signal: AbortSignal): AsyncIterable<{ event: string, data: IrEvent }>
  preview(document: string): Promise<PreviewAnswer>
  build(document: string, to?: string[]): Promise<BuildAnswer>
  check(document: string): Promise<CheckAnswer>
  proxies: ProxySpec[]
}

export function irRevision(doc: IRDocument): string {
  return createHash('sha256').update(JSON.stringify(doc)).digest('hex').slice(0, 16)
}

export function withRevision(doc: IRDocument, revision: string): IRDocument {
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

export interface ServiceOptions {
  root: string
  sessionOf(dir: string): DocumentSession
  serverHost: ServerHost
  url(): string
  preview?: { origins: string[] }
  stateDir: string
  log: Logger
}

export interface Service extends WorkspaceService {
  compiled(dir: string, compilation: Compilation, changed: string[]): void
  siteDoc(compilation: Compilation, doc: IRDocument): IRDocument
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
          ...options.preview ? { preview: { origins: options.preview.origins } } : {},
          onCompile(_compilation, findings) {
            for (const finding of findings.filter(f => f.checkId === 'presmium.render')) log.warn(`the slides' preview of ${dir || '.'}: ${finding.message}`)
          },
        })
        const server = started.servers[0]
        if (!server || closed) {
          await started.close()
          return undefined
        }
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
      const session = options.sessionOf(document)
      if (session.latest) waiting.push(eventOf(document, session.latest, []))
      else void session.ready().catch(() => undefined)
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
      const own = await slidesOf(document).catch(() => undefined)
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
