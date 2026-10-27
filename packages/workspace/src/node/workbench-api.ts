import { relative, sep } from 'node:path'
import { relativeIR } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'
import { errorMessage, PREVIEW_REVISION, pushStream } from '@lincyaw/kernel'
import { irRevision } from '@lincyaw/kernel/node'
import type { DocumentVoiceAuthoring, DocumentVoiceCapabilities, Finding, IrAnswer, IRDocument, IrEvent, Logger, Member, PreviewAnswer, PreviewRenderer, VoiceCatalogAnswer } from '@lincyaw/kernel'
import type { DiagnosticStore, ServerHost } from '@lincyaw/server'
import type { CompileSession } from './compile-session.ts'

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
  /** Observe already-requested compilations without starting one for source editing. */
  onCompiled(document: string, listener: (event: IrEvent) => void): () => void
  voiceCatalog(document: string, member: Member, engine?: string, lang?: string, signal?: AbortSignal): Promise<VoiceCatalogAnswer>
  voiceCapabilities(document: string, member: Member, signal?: AbortSignal): Promise<DocumentVoiceCapabilities>
  events(document: string, signal: AbortSignal): AsyncIterable<{ event: string, data: IrEvent }>
  /**
   * The document's preview addresses: the viewer app's page of the document, and the same page showing its slides.
   * `prefetch`: the workbench prepares the document ahead of the author's click, answered at once.
   */
  preview(document: string, renderer?: PreviewRenderer, prefetch?: boolean): Promise<PreviewAnswer>
  build(document: string, to?: string[]): Promise<BuildAnswer>
  check(document: string): Promise<CheckAnswer>
}

function withIrRevision(doc: IRDocument, revision: string): IRDocument {
  return { ...doc, meta: { ...doc.meta, [PREVIEW_REVISION]: revision } }
}

function workspacePath(root: string, file: string): string {
  return relative(root, file).split(sep).join('/')
}

function urlPath(dir: string): string {
  return dir.split('/').map(encodeURIComponent).join('/')
}

export interface WorkbenchBackendOptions {
  root: string
  compileSessionOf(dir: string): CompileSession
  serverHost: ServerHost
  voices: DocumentVoiceAuthoring
  diagnostics?: DiagnosticStore
  url(): string
  preview?: { origins: string[] }
  log: Logger
  /** Starts the web dev server of a document ahead of its first request. */
  warmSite?(dir: string): Promise<void>
  /** The path of the document's page in the viewer app, once it can be shown there (prepared when not; `wait`: a while). */
  viewerPage?(dir: string, wait: boolean): Promise<string | undefined>
}

/** The workbench's API with what the workspace server tells it: each compilation, the documents removed, closing. */
export interface WorkbenchBackend extends WorkbenchApi {
  compiled(dir: string, compilation: Compilation, changed: string[]): void
  /** The document as the site shows it, stamped with its IR revision when pages embed previews. */
  stampPreviewRevision(compilation: Compilation, doc: IRDocument): IRDocument
  documentsRemoved(dirs: string[]): Promise<void>
  close(): Promise<void>
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
  let previewRequest = 0

  const eventOf = (dir: string, compilation: Compilation, changed: string[]): IrEvent => {
    const count = (severity: Finding['severity']) => compilation.doc.diagnostics.filter(finding => finding.severity === severity).length
    return { document: dir, revision: irRevisionOf(compilation), diagnostics: { errors: count('error'), warnings: count('warning') }, files: changed.map(file => workspacePath(root, file)) }
  }
  return {
    onCompiled(document, listener) {
      const own = listeners.get(document) ?? new Set()
      listeners.set(document, own); own.add(listener)
      return () => { own.delete(listener); if (!own.size) listeners.delete(document) }
    },
    voiceCapabilities: (document, member, signal) => options.voices.capabilities(document, member, signal),
    voiceCatalog: (document, member, engine, lang, signal) => options.voices.catalog(document, { ...engine ? { engine } : {}, ...lang ? { lang } : {} }, member, signal),
    async ir(document) {
      const compilation = await options.compileSessionOf(document).ready()
      let doc = relativeDocs.get(compilation)
      if (!doc) relativeDocs.set(compilation, doc = relativeIR(compilation.doc, root, root))
      return { document, revision: irRevisionOf(compilation), doc, diagnostics: doc.diagnostics, sourceCapabilities: compilation.sourceCapabilities,
        ...compilation.sourceFingerprints ? { sourceFingerprints: Object.fromEntries(Object.entries(compilation.sourceFingerprints).map(([file, value]) => [workspacePath(root, file), value])) } : {} }
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
      const request = ++previewRequest
      const started = Date.now()
      const label = `[preview ${request}] document=${JSON.stringify(document || '.')} renderer=${renderer ?? 'all'} prefetch=${prefetch}`
      let phase = 'viewer'
      let outcome = 'failed'
      log.info(`${label} state=started`)
      try {
        const base = options.url()
        // The viewer app's page once it has what the document needs (an opened document waits for it a while), else the
        // document's page on the site.
        const page = await options.viewerPage?.(document, !prefetch).catch((error: unknown) => {
          log.warn(`the viewer app cannot show ${document || '.'}: ${errorMessage(error)}`)
          if (!prefetch) throw error
          return undefined
        })
        const web = page ? `${base}${page}` : `${base}/${document ? `${urlPath(document)}/` : ''}`
        log.info(`${label} phase=viewer source=${page ? 'app' : 'site'} elapsedMs=${Date.now() - started}`)
        phase = 'compilation'
        if (prefetch && !page) void options.warmSite?.(document).catch(() => undefined)
        const compilation = await options.compileSessionOf(document).ready()
        const configured = Object.keys(compilation.doc.config.renderers)
        const slides = configured.length === 0 || configured.includes('slides')
        outcome = 'ready'
        return { document, web, ...slides ? { slides: `${web}${web.includes('?') ? '&' : '?'}form=slides` } : {} }
      } catch (error) {
        log.warn(`${label} phase=${phase} error=${errorMessage(error)}`)
        throw error
      } finally {
        log.info(`${label} state=${outcome} phase=${phase} elapsedMs=${Date.now() - started}`)
      }
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
    },
    stampPreviewRevision(compilation, doc) {
      return options.preview ? withIrRevision(doc, irRevisionOf(compilation)) : doc
    },
    async documentsRemoved(dirs) {
      for (const dir of dirs) options.diagnostics?.forget(dir)
    },
    async close() {},
  }
}
