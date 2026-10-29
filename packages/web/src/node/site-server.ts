import { createReadStream, existsSync, mkdirSync, realpathSync, statSync, watch } from 'node:fs'
import type { ChildProcess } from 'node:child_process'
import type { FSWatcher } from 'node:fs'
import { Agent, createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Duplex } from 'node:stream'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { errorMessage, irBlocks, isRecord, localRequestRefusal, previewFrameAncestors, PreviewPreparing, safeDecodeURIComponent, viewFor } from '@lincyaw/kernel'
import type { IRDocument, NodeVitePlugin, RenderContext, RuntimeAssets, SiteSpec } from '@lincyaw/kernel'
import { isInside, spawnInteractiveNode } from '@lincyaw/kernel/node'
import { diffDocuments } from '@lincyaw/viewer/domain'
import { createProxyServer } from 'http-proxy-3'
import send from 'send'
import { searchDocuments, sitePageLayout, translationPages, UPDATE_EVENT, webPages } from '../domain/index.ts'
import type { AppConfig, DevUpdateEvent, WebPage } from '../domain/index.ts'
import { BUNDLE_ENTRY, documentComponents, findDocumentBundle } from './document-bundle.ts'
import type { DocumentBundle, DocumentBundleInput } from './document-bundle.ts'
import { irRevisionOfJson, PublicationCache, publishedDocument } from './publish.ts'
import { findRuntimeAsset, REVISION_HEADER, runtimeAssets, searchIndex } from './site-files.ts'
import { documentBase, documentPage, documentSiteConfig, homeDocument, homeDocuments, isSingle, landingConfig, landingDocument, languageLabel, LIST_PAGE, siteLanguage, siteLanguages, siteNeighbours, siteShellBelow } from './site-model.ts'
import { publishedSite } from './site-assets.ts'
import { loadLanding, publishLanding, siteContent } from './landing.ts'
import { buildLandingTemplate, writeLandingTemplate } from './landing-template.ts'
import { pageHtml } from './site-page.ts'
import { appEntry, appPlugin, coreFingerprint, findViewerApp, sharedSpecifiers } from './viewer-app.ts'
import type { AppPlugin, ViewerApp } from './viewer-app.ts'
import type { ViewerBuildRequest } from './viewer-build.ts'

/**
 * The web form in development: the viewer app, prebuilt once for the site's plugins, shows every page of every document
 * as the built site would, rendered in the browser. Below `<base>__app/` are the app's own routes: a document's IR
 * (`ir`), its changes (`events`, server-sent; the sections that changed), its search index (`search`), the workbench's
 * page of a document (`view`), the app's files (`v/<key>/`) and the documents' bundles (`d/<dir>/<key>/`). Below each
 * document's site path are its pages, its published files (`media/`), its plugins' run-time files and its `public/`.
 */

const BUILD_SCRIPT = fileURLToPath(new URL('./viewer-build.ts', import.meta.url))
const PREFIX = '__app/'
const SERVER_PROXY = '/__presmium/'
// The fingerprints of sources are taken again at most this often.
const FINGERPRINT_MS = 3000
const CHANGE_MS = 200
const KEEPALIVE_MS = 25_000
// Files whose address names their content are cached a year.
const IMMUTABLE_MS = 365 * 24 * 3600_000
// The workbench's first preview waits this long for the app and the document's bundle.
const WAIT_MS = 15_000
const IGNORED = /(?:^|[\\/])(?:node_modules|\.presmium|\.git|dist)(?:[\\/]|$)/

/** What a page shows of a document: its pages, or its slides. */
type Form = 'web' | 'slides'

export interface SiteServerOptions {
  site(): SiteSpec
  /** The form of the server's pages (`presmium dev --to slides` serves the slides); the workbench asks for either. */
  form?: Form
  /** The site's render context: its path (`base`), the workspace, the operator's plugins, the previews' origins. */
  ctx: RenderContext
  /** Where viewer apps are kept, shared by every workspace. */
  cacheDir: string
  /** The server's own state: the documents' bundles and published files. */
  workDir: string
  /** The document as the site shows it (compiled when not yet). */
  document(dir: string): Promise<IRDocument>
  /** The document's render context, below its own site path. */
  context(dir: string, doc: IRDocument): RenderContext
  nodePlugins(dir: string): readonly NodeVitePlugin[]
  /** The document's translations, as compiled now. */
  translations(dir: string): readonly { lang: string, doc: IRDocument }[]
  listen: { host: string, port: number }
  /** Opens a source line in the author's editor (`presmium dev`). */
  openSource?(file: string, line: number): void
  log?(message: string): void
}

export interface SiteServer {
  /** The site's address. */
  url: string
  origin: string
  /** The document changed: its pages get the sections that changed. */
  update(dir: string, doc: IRDocument): void
  /**
   * The path of the workbench's page of the document, once the app has its plugins and the document's bundle is built:
   * started when missing, waited for a while with `wait`.
   */
  app(dir: string, wait?: boolean): Promise<string | undefined>
  /** Builds what the document's pages need ahead of their first request. */
  warm(dir: string): Promise<void>
  close(): Promise<void>
}

interface Published {
  source: IRDocument
  doc: IRDocument
  json: string
  revision: string
  search?: string
}

interface DocumentState {
  /** The document's bundle: none when it has no code of its own, unknown until looked for. */
  bundle?: DocumentBundle | null
  bundleFailure?: string
  /** The modules the bundle imports by name: the app's. */
  externals?: readonly string[]
  building?: Promise<void>
  stale?: boolean
  watcher?: FSWatcher
  timer?: ReturnType<typeof setTimeout>
  /** The published IR of each form and language (`slides:`, `web:` the document's own, `web:<lang>` a translation's). */
  published: Map<string, Published>
  caches: Map<Form, PublicationCache>
  listeners: Set<{ res: ServerResponse, app: string, lang: string, form: Form }>
  assets?: Promise<RuntimeAssets[]>
}

// A document's directory as one segment of a path; the document at the root as `~` (a `.` would be taken out of the address).
const segment = (dir: string) => (dir ? encodeURIComponent(dir) : '~')

/** Sends the file at `path` (URL-encoded, below `root`) through `send` (Express's): types, ranges and validators as HTTP defines them. */
function serveFile(req: IncomingMessage, res: ServerResponse, root: string, path: string, immutable: boolean): void {
  send(req, path, { root, ...immutable ? { maxAge: IMMUTABLE_MS, immutable: true } : {}, index: false, dotfiles: 'allow' })
    .on('error', (error: { status?: number }) => {
      if (res.headersSent) return res.destroy()
      res.writeHead(error.status ?? 500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(error.status === 404 ? 'not found' : 'the file could not be read')
    })
    .pipe(res)
}

interface BuildWorker {
  run<T>(request: ViewerBuildRequest): Promise<T>
  close(): void
}

/**
 * The process that builds the viewer app and the documents' bundles, apart from the server, which stays responsive:
 * started on the first build, at the interactive budget (the author may be waiting), and kept for the next.
 */
function createBuildWorker(): BuildWorker {
  let child: ChildProcess | undefined
  let serial = 0
  const waiting = new Map<number, { resolve(value: unknown): void, reject(error: Error): void }>()
  const start = () => {
    const spawned = spawnInteractiveNode(BUILD_SCRIPT, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
    spawned.on('message', ({ id, ok, result, error }: { id: number, ok: boolean, result?: unknown, error?: string }) => {
      const answer = waiting.get(id)
      waiting.delete(id)
      if (ok) answer?.resolve(result)
      else answer?.reject(new Error(error))
    })
    spawned.once('exit', (code) => {
      if (child === spawned) child = undefined
      for (const answer of waiting.values()) answer.reject(new Error(`the viewer's build process exited with code ${code}`))
      waiting.clear()
    })
    spawned.once('error', () => undefined)
    return spawned
  }
  return {
    run<T>(request: ViewerBuildRequest) {
      const worker = child ??= start()
      const id = ++serial
      return new Promise<T>((resolve, reject) => {
        waiting.set(id, { resolve: resolve as (value: unknown) => void, reject })
        worker.send({ ...request, id })
      })
    },
    close() {
      child?.kill()
    },
  }
}

/** Whether a bundle importing `imported` by name imports only modules of `externals`. */
function importsOnly(imported: readonly string[] | undefined, externals: readonly string[]): boolean {
  if (imported === undefined) return false
  const names = new Set(externals)
  return imported.every(name => names.has(name))
}

/** The page of a document a path below its language's site path is: `''` and `index.html` its first, `<path>.html` another. */
function pageAt(pages: readonly WebPage[], rest: string): WebPage | undefined {
  const name = rest === '' || rest === 'index.html' ? 'index' : rest.endsWith('.html') ? rest.slice(0, -'.html'.length) : undefined
  return name === undefined ? undefined : pages.find(page => page.path === name)
}

export async function startSiteServer(options: SiteServerOptions): Promise<SiteServer> {
  const { ctx } = options
  const base = ctx.base
  siteShellBelow(options.site(), base)
  landingDocument(options.site())
  loadLanding(options.site(), ctx)
  const templateOutputs = new Set<string>()
  const templateBuilds = new Map<string, Promise<string>>()
  const states = new Map<string, DocumentState>()
  const plugins = new Map<string, { plugin: Promise<AppPlugin>, at: number }>()
  const worker = createBuildWorker()
  let core = { value: coreFingerprint(), at: Date.now() }
  let current: ViewerApp | undefined
  // The apps whose pages show code since changed.
  const outdated = new Set<string>()
  let building: Promise<void> | undefined
  // Why the last build of the app failed; cleared when one succeeds.
  let appFailure: string | undefined
  let pending: AppPlugin[] | undefined
  let closed = false
  const log = options.log ?? ((message: string) => console.warn(`[presmium] ${message}`))
  // The workspace service's pages: only the workbench's origins may frame them, and none when it names none.
  const framed = ctx.preview ? previewFrameAncestors(ctx.preview.origins) : undefined
  const latest = new Map<string, IRDocument>()

  const documents = () => options.site().documents.map(entry => entry.dir)
  const shellSite = () => publishedSite(options.site(), ctx, join(options.workDir, 'site-assets'), `${base}${PREFIX}site-assets/`)
  const stateOf = (dir: string): DocumentState => {
    let state = states.get(dir)
    if (!state) states.set(dir, state = { caches: new Map(), listeners: new Set(), published: new Map() })
    return state
  }
  const documentOf = async (dir: string): Promise<IRDocument> => {
    const doc = latest.get(dir) ?? await options.document(dir)
    if (!latest.has(dir)) latest.set(dir, doc)
    return latest.get(dir)!
  }

  const coreNow = () => {
    if (Date.now() - core.at > FINGERPRINT_MS) core = { value: coreFingerprint(), at: Date.now() }
    return core.value
  }

  /** The plugin package at `dir` as it is now (its fingerprint taken again when old). */
  const pluginAt = (name: string, dir: string): Promise<AppPlugin> => {
    const known = plugins.get(dir)
    if (known && Date.now() - known.at < FINGERPRINT_MS) return known.plugin
    const plugin = appPlugin(name, dir)
    plugins.set(dir, { plugin, at: Date.now() })
    plugin.catch(() => plugins.delete(dir))
    return plugin
  }

  /** The plugin packages a document's pages run: its own and the operator's. */
  const pluginsOf = async (dir: string, doc: IRDocument): Promise<AppPlugin[]> => {
    const own = options.context(dir, doc)
    const named = new Map<string, string>()
    for (const name of own.plugins) if (own.pluginDirs[name]) named.set(name, own.pluginDirs[name]!)
    for (const name of ctx.plugins) if (ctx.pluginDirs[name]) named.set(name, ctx.pluginDirs[name]!)
    return await Promise.all([...named].map(([name, at]) => pluginAt(name, at)))
  }
  const operatorPlugins = async () => await Promise.all(ctx.plugins.filter(name => ctx.pluginDirs[name]).map(name => pluginAt(name, ctx.pluginDirs[name]!)))

  const notify = (dir: string, event: string, data: (lang: string) => unknown, which: (app: string) => boolean = () => true) => {
    for (const listener of states.get(dir)?.listeners ?? []) {
      if (which(listener.app)) listener.res.write(`event: ${event}\ndata: ${JSON.stringify(data(listener.lang))}\n\n`)
    }
  }
  const reload = (dir: string, which?: (app: string) => boolean) => notify(dir, 'reload', () => ({}), which)

  /**
   * Makes `app` the current one. The pages of the one before stay when it only had fewer plugins (its files stay too);
   * when Presmium's code or a plugin's changed, they reload.
   */
  const replace = (app: ViewerApp) => {
    const before = current
    current = app
    if (!before || before.manifest.key === app.manifest.key) return
    const { core, plugins } = before.manifest
    if (core === app.manifest.core && Object.entries(plugins).every(([name, known]) => (app.manifest.plugins[name] ?? known) === known)) return
    outdated.add(before.manifest.key)
    for (const dir of states.keys()) reload(dir, key => outdated.has(key))
  }

  /** Whether the current app has these plugins as they are now. */
  const hasPlugins = (wanted: readonly AppPlugin[]) =>
    current !== undefined && current.manifest.core === coreNow() && wanted.every(p => current!.manifest.plugins[p.name] === p.fingerprint)

  /** Builds the app with these plugins, one build at a time; the pages of an older app reload. */
  const buildApp = (wanted: AppPlugin[]): Promise<void> => {
    pending = wanted
    building ??= (async () => {
      while (pending && !closed) {
        const all = pending
        pending = undefined
        if (hasPlugins(all)) continue
        const started = Date.now()
        try {
          const app = await worker.run<ViewerApp>({ kind: 'app', cacheDir: options.cacheDir, plugins: all })
          if (closed) return
          replace(app)
          appFailure = undefined
          log(`the viewer app was built in ${((Date.now() - started) / 1000).toFixed(1)} s`)
        } catch (error) {
          appFailure = stripVTControlCharacters(errorMessage(error))
          log(`the viewer app could not be built: ${errorMessage(error)}`)
        }
      }
    })().finally(() => {
      building = undefined
    })
    return building
  }

  /** The app with `wanted` and every plugin of the pages shown so far, found in the cache or built. */
  const appWith = async (wanted: readonly AppPlugin[]): Promise<{ externals: string[], built: Promise<unknown> }> => {
    if (!hasPlugins(wanted)) {
      const found = findViewerApp(options.cacheDir, coreNow(), wanted)
      if (found) replace(found)
    }
    if (hasPlugins(wanted)) return { externals: Object.keys(current!.manifest.shared), built: Promise.resolve() }
    // The app has the plugins of the documents shown before too, so that it serves them all.
    const seen = await Promise.all([...states.keys()].map(async other => pluginsOf(other, await documentOf(other)).catch(() => [])))
    const all = [...new Map([...seen.flat(), ...await operatorPlugins(), ...wanted].map(p => [p.name, p])).values()]
    return { externals: Object.keys(sharedSpecifiers(all)), built: buildApp(all) }
  }

  const bundleInput = (dir: string, deckDir: string, externals: readonly string[]): DocumentBundleInput => ({
    deckDir,
    workspaceRoot: ctx.workspaceRoot,
    outDir: join(options.workDir, 'bundles', segment(dir)),
    externals: [...externals],
    nodePlugins: options.nodePlugins(dir).map(({ entry, config }) => ({ entry, config })),
    components: documentComponents(latest.get(dir)),
  })

  /** Watches the document's files: when its code changes, its bundle is built again and its pages reload. */
  const watchDocument = (dir: string, deckDir: string, state: DocumentState) => {
    if (state.watcher || closed) return
    try {
      state.watcher = watch(deckDir, { recursive: true }, (_event, name) => {
        if (!name || IGNORED.test(name.toString())) return
        clearTimeout(state.timer)
        state.timer = setTimeout(() => void refreshBundle(dir, deckDir, state), CHANGE_MS)
      })
      state.watcher.on('error', () => undefined)
    } catch {}
  }

  /** Finds the bundle of the document's files as they are now, or builds it; its pages reload when it changed. */
  const refreshBundle = async (dir: string, deckDir: string, state: DocumentState) => {
    if (closed || state.externals === undefined) return
    if (state.building) {
      state.stale = true
      return
    }
    const { externals } = state
    const found = await findDocumentBundle(bundleInput(dir, deckDir, externals)).catch(() => undefined)
    if (closed || state.externals !== externals) return
    if (found === undefined) {
      const before = state.bundle?.key ?? null
      await buildBundle(dir, deckDir, state, externals)
      if (!closed && state.externals === externals && (state.bundle?.key ?? null) !== before) reload(dir)
      return
    }
    if ((found?.key ?? null) === (state.bundle?.key ?? null)) return
    state.bundle = found
    reload(dir)
  }

  /** Builds the document's bundle importing `externals` by name; it is kept when they are still the ones wanted. */
  const buildBundle = (dir: string, deckDir: string, state: DocumentState, externals: readonly string[]): Promise<void> => {
    state.building ??= (async () => {
      const started = Date.now()
      try {
        const bundle = await worker.run<DocumentBundle | null>({ kind: 'document', input: bundleInput(dir, deckDir, externals) })
        if (state.externals === externals) { state.bundle = bundle; state.bundleFailure = undefined }
        if (bundle) log(`the code of ${dir || '.'} was bundled in ${((Date.now() - started) / 1000).toFixed(1)} s`)
      } catch (error) {
        if (state.externals === externals) state.bundleFailure = stripVTControlCharacters(errorMessage(error))
        log(`the code of ${dir || '.'} could not be bundled: ${errorMessage(error)}`)
      } finally {
        state.building = undefined
        if (state.stale) {
          state.stale = false
          void refreshBundle(dir, deckDir, state)
        }
      }
    })()
    return state.building
  }

  /**
   * Prepares what the document's pages need: the app with its plugins and the document's bundle, built at the same time
   * (the modules the bundle imports by name are known before the app is built).
   */
  const prepare = async (dir: string): Promise<{ ready: () => boolean, done: Promise<unknown> }> => {
    const doc = await documentOf(dir)
    const own = options.context(dir, doc)
    const wanted = await pluginsOf(dir, doc)
    const { externals, built } = await appWith(wanted)
    const state = stateOf(dir)
    watchDocument(dir, own.deckDir, state)
    // A bundle that imports some of the app's modules by name runs with it; one that bundled any of them is built again.
    if (!importsOnly(state.externals, externals)) {
      state.externals = externals
      state.bundle = undefined
      state.bundleFailure = undefined
    }
    if (state.bundle === undefined && !state.building) {
      const found = await findDocumentBundle(bundleInput(dir, own.deckDir, externals)).catch(() => undefined)
      if (found !== undefined) state.bundle = found
      else void buildBundle(dir, own.deckDir, state, externals)
    }
    const ready = () => hasPlugins(wanted) && state.bundle !== undefined && importsOnly(state.externals, Object.keys(current!.manifest.shared))
    return { ready, done: Promise.all([built, state.building]) }
  }

  // A document as each form sees it (`{only}`): the server gets the document whole.
  const views = new WeakMap<IRDocument, Map<Form, IRDocument>>()
  const viewOf = (doc: IRDocument, form: Form): IRDocument => {
    let known = views.get(doc)
    if (!known) views.set(doc, known = new Map())
    let view = known.get(form)
    if (!view) known.set(form, view = viewFor(doc, form))
    return view
  }
  const docs = () => new Map([...latest].map(([dir, doc]) => [dir, viewOf(doc, 'web')] as const))

  /** The document's IR in a form and language as its pages read it: published, its files below its site path. */
  const published = (dir: string, doc: IRDocument, lang = '', form: Form = 'web', unfiltered = false): Published => {
    const state = stateOf(dir)
    const key = `${unfiltered ? 'block' : form}:${lang}`
    const known = state.published.get(key)
    if (known?.source === doc) return known
    const own = options.context(dir, doc)
    const docBase = documentBase(base, dir)
    const linked = isSingle(options.site()) ? undefined : documentPage(options.site(), base, docs())
    let cache = state.caches.get(form)
    if (!cache) state.caches.set(form, cache = new PublicationCache())
    const shown = publishedDocument(lang || unfiltered ? doc : viewOf(doc, form), own, join(options.workDir, 'media', segment(dir)), docBase, linked, lang ? undefined : cache)
    const json = JSON.stringify(shown)
    const next = { source: doc, doc: shown, json, revision: irRevisionOfJson(json) }
    state.published.set(key, next)
    return next
  }

  const translationOf = (dir: string, lang: string) => options.translations(dir).find(t => t.lang === lang)

  /** What a document's page in `lang` (`''` its own) tells the app. */
  const documentConfig = (dir: string, doc: IRDocument, lang: string, page: WebPage | undefined, bundle: DocumentBundle | null | undefined, workbench: boolean, form: Form): AppConfig => {
    const site = shellSite()
    const docBase = documentBase(base, dir)
    const query = `document=${encodeURIComponent(dir)}${lang ? `&lang=${encodeURIComponent(lang)}` : ''}${form === 'slides' ? '&form=slides' : ''}`
    const shown = lang ? translationOf(dir, lang)?.doc ?? doc : doc
    const own = doc.meta.lang ?? ctx.lang ?? 'zh-CN'
    const pages = lang ? translationPages(published(dir, shown, lang).doc, webPages(published(dir, doc).doc)) : undefined
    const shownSite = documentSiteConfig({ site, base, dir, doc, lang: lang || own, docs: docs(), workspace: !isSingle(site) })
    if (!workbench && form === 'slides' && options.form !== 'slides') shownSite.links = { ...shownSite.links, webUrl: `${docBase}${lang ? `${lang}/` : ''}` }
    return {
      kind: 'document',
      document: dir,
      base: docBase,
      lang: lang || own,
      ...form === 'slides' ? { form } : {},
      ir: `${base}${PREFIX}ir?${query}`,
      events: `${base}${PREFIX}events?${query}&app=${current!.manifest.key}`,
      ...base !== '/' ? { server: base } : {},
      ...bundle ? { bundle: `${base}${PREFIX}d/${segment(dir)}/${bundle.key}/${BUNDLE_ENTRY}` } : {},
      ...form === 'web' ? { search: `${base}${PREFIX}search?${query}` } : {},
      ...page ? { page: page.path } : {},
      ...pages ? { pages } : {},
      site: { ...shownSite, ...isSingle(site) ? { brandTitle: shown.meta.title } : {}, layout: sitePageLayout(isRecord(shown.config.renderers.web) ? shown.config.renderers.web : {}, lang || own) },
      plugins: workbench ? options.context(dir, doc).plugins : [...new Set([...options.context(dir, doc).plugins, ...ctx.plugins])],
      origins: ctx.preview?.origins ?? [],
      ...options.openSource && !workbench ? { source: `${base}${PREFIX}source` } : {},
    }
  }

  const html = (res: ServerResponse, status: number, config: AppConfig, title: string) => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...framed ? { 'Content-Security-Policy': framed } : {} })
    res.end(pageHtml({ entry: appEntry(current!), appUrl: `${base}${PREFIX}v/${current!.manifest.key}/`, shared: current!.manifest.shared, config, title }))
  }

  /** A page that shows no document: the home page or a missing page, with the operator's plugins. */
  const plainPage = async (res: ServerResponse, kind: 'home' | 'missing', lang?: string, independent = false) => {
    const site = shellSite()
    const own = siteLanguage(site, ctx.lang)
    const others = siteLanguages(site, own)
    const locales = [{ lang: own, label: languageLabel(own), base }, ...others.map(other => ({ lang: other.lang, label: languageLabel(other.lang), base: `${base}${other.lang}/` }))]
    const landing = independent ? loadLanding(site, ctx) : undefined
    if (landing?.kind === 'template') {
      const key = `${lang ?? own}:${landing.file}`
      let pending = templateBuilds.get(key)
      if (!pending) {
        pending = (async () => {
          const output = await buildLandingTemplate(landing.file, join(options.workDir, 'landing', lang ?? own), base, siteContent(site, base, lang ?? own, homeDocuments(site, base, docs(), lang)), ctx.workspaceRoot)
          const published = join(options.workDir, 'landing', 'published')
          writeLandingTemplate(output, published)
          templateOutputs.add(published)
          return output.html
        })()
        templateBuilds.set(key, pending)
      }
      let body: string
      try { body = await pending } finally { if (templateBuilds.get(key) === pending) templateBuilds.delete(key) }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...framed ? { 'Content-Security-Policy': framed } : {} })
      return void res.end(body)
    }
    const { built } = await appWith(await operatorPlugins())
    await built
    if (!current) return void res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('the viewer app could not be built')
    const title = others.find(other => other.lang === lang)?.title ?? site.title
    const config: AppConfig = {
      kind,
      document: '',
      base,
      lang: lang ?? own,
      site: { title, brandTitle: title, root: `${base}${lang ? `${lang}/` : ''}`, shell: siteShellBelow(site, base), locales, links: {} },
      ...kind === 'home' ? { documents: homeDocuments(site, base, docs(), lang) } : {},
      ...landing?.kind === 'page' ? { landingPage: publishLanding(landing, site, ctx, join(options.workDir, 'site-assets'), `${base}${PREFIX}site-assets/`, docs()) } : {},
      plugins: ctx.plugins,
      origins: ctx.preview?.origins ?? [],
    }
    html(res, kind === 'missing' ? 404 : 200, config, config.landingPage?.title ?? title)
  }

  /** A new preview must confirm current project files, even before the debounced watcher rebuilds. */
  const currentDocumentBundle = async (dir: string, doc: IRDocument): Promise<boolean> => {
    const state = stateOf(dir), own = options.context(dir, doc)
    for (let attempt = 0; attempt < 3; attempt++) {
      const externals = state.externals
      if (closed || !externals || !current) return false
      const found = await findDocumentBundle(bundleInput(dir, own.deckDir, externals)).catch(() => undefined)
      if (closed || state.externals !== externals) continue
      if (found !== undefined) { state.bundle = found; state.bundleFailure = undefined; return true }
      await (state.building ?? buildBundle(dir, own.deckDir, state, externals))
    }
    return false
  }

  /** A document's page (or its workbench page), once the app and the document's bundle are there. */
  const documentPageResponse = async (res: ServerResponse, dir: string, lang: string, rest: string | undefined, form: Form = 'web', block?: string, landing = false) => {
    const { ready, done } = await prepare(dir)
    if (!ready()) await done
    if (!ready() || !current) return void res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('the viewer app or the document\'s code could not be built; the server\'s log says why')
    const doc = await documentOf(dir)
    const shown = lang ? translationOf(dir, lang)?.doc : doc
    if (!shown) return plainPage(res, 'missing')
    if (!await currentDocumentBundle(dir, doc)) return void res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('the compiled document code is not current')
    if (block !== undefined && !shown.sections.some(section => [...irBlocks(section.blocks)].some(node => node.id === block))) return void res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('the compiled block does not exist')
    const pages = lang ? translationPages(published(dir, shown, lang).doc, webPages(published(dir, doc).doc)) : webPages(published(dir, doc).doc)
    const page = rest === undefined ? undefined : pageAt(pages, rest)
    if (rest !== undefined && !page) return plainPage(res, 'missing')
    const state = stateOf(dir)
    let config = documentConfig(dir, doc, lang, form === 'slides' ? undefined : page, state.bundle, rest === undefined, block === undefined ? form : 'web')
    if (landing) config = landingConfig(config, shown, options.site(), base, lang)
    if (block !== undefined) {
      config.block = block
      config.ir += `&presmium-block=${encodeURIComponent(block)}`
      delete config.events; delete config.source; delete config.search; delete config.serviceWorker
    }
    html(res, 200, config, page && page.title !== shown.meta.title ? `${page.title} | ${shown.meta.title}` : shown.meta.title)
  }

  const formOf = (url: URL): Form => (url.searchParams.get('form') === 'slides' ? 'slides' : url.searchParams.get('form') === 'web' ? 'web' : options.form ?? 'web')

  const irRoute = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const dir = url.searchParams.get('document') ?? ''
    const lang = url.searchParams.get('lang') ?? ''
    if (!documents().includes(dir)) return void res.writeHead(404).end()
    const doc = await documentOf(dir)
    const shown = lang ? translationOf(dir, lang)?.doc : doc
    if (!shown) return void res.writeHead(404).end()
    const block = url.searchParams.get('presmium-block')
    if (block !== null && !shown.sections.some(section => [...irBlocks(section.blocks)].some(node => node.id === block))) return void res.writeHead(404).end()
    const answer = published(dir, shown, lang, formOf(url), block !== null)
    const etag = `"${answer.revision}"`
    const headers = { 'ETag': etag, [REVISION_HEADER]: answer.revision, 'Cache-Control': 'no-store' }
    if (req.headers['if-none-match'] === etag) return void res.writeHead(304, headers).end()
    res.writeHead(200, { ...headers, 'Content-Type': 'application/json; charset=utf-8' })
    res.end(answer.json)
  }

  const searchRoute = async (res: ServerResponse, url: URL) => {
    const dir = url.searchParams.get('document') ?? ''
    const lang = url.searchParams.get('lang') ?? ''
    if (!documents().includes(dir)) return void res.writeHead(404).end()
    const doc = await documentOf(dir)
    const shown = lang ? translationOf(dir, lang)?.doc : doc
    if (!shown) return void res.writeHead(404).end()
    const answer = published(dir, shown, lang)
    const root = `${documentBase(base, dir)}${lang ? `${lang}/` : ''}`
    const pages = lang ? translationPages(answer.doc, webPages(published(dir, doc).doc)) : webPages(answer.doc)
    const site = options.site()
    answer.search ??= searchIndex([...searchDocuments(answer.doc, root, pages), ...isSingle(site) ? [] : siteNeighbours(site, base, dir, docs()).search])
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(answer.search)
  }

  const eventsRoute = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const dir = url.searchParams.get('document') ?? ''
    if (!documents().includes(dir)) return void res.writeHead(404).end()
    const listener = { res, app: url.searchParams.get('app') ?? '', lang: url.searchParams.get('lang') ?? '', form: formOf(url) }
    const state = stateOf(dir)
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
    res.write('retry: 1000\n\n')
    // A page of an app whose code has since changed reloads to the current one.
    if (outdated.has(listener.app)) res.write('event: reload\ndata: {}\n\n')
    state.listeners.add(listener)
    const keepalive = setInterval(() => res.write(': keepalive\n\n'), KEEPALIVE_MS)
    req.on('close', () => {
      clearInterval(keepalive)
      state.listeners.delete(listener)
    })
  }

  const sourceRoute = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    if (req.method !== 'POST' || req.headers['presmium-request'] !== 'source' || !options.openSource) return void res.writeHead(405).end()
    const file = url.searchParams.get('file')
    const line = Number(url.searchParams.get('line'))
    if (file) options.openSource(file, Number.isInteger(line) && line > 0 ? line : 1)
    res.writeHead(file ? 204 : 400).end()
  }

  /** The app's own routes, below `<base>__app/`. */
  const appRoute = async (req: IncomingMessage, res: ServerResponse, url: URL, rest: string) => {
    if (rest === 'view') {
      const dir = url.searchParams.get('document') ?? ''
      return documents().includes(dir) ? documentPageResponse(res, dir, '', undefined, formOf(url), url.searchParams.get('presmium-block') ?? undefined) : plainPage(res, 'missing')
    }
    if (rest === 'ir') return irRoute(req, res, url)
    if (rest === 'search') return searchRoute(res, url)
    if (rest === 'events') return eventsRoute(req, res, url)
    if (rest === 'source') return sourceRoute(req, res, url)
    if (rest.startsWith('site-assets/')) return serveFile(req, res, join(options.workDir, 'site-assets'), `/${rest.slice('site-assets/'.length)}`, false)
    const [kind, ...parts] = rest.split('/')
    const below = (n: number) => `/${parts.slice(n).join('/')}`
    if (kind === 'v' && parts.length >= 2) return serveFile(req, res, join(options.cacheDir, parts[0]!), below(1), true)
    if (kind === 'd' && parts.length >= 3) return serveFile(req, res, join(options.workDir, 'bundles', parts[0]!, parts[1]!), below(2), true)
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found')
  }

  /** A path below a document's site path: a page (its own, or a translation's), a published or run-time file, or its `public/`. */
  const documentRoute = async (req: IncomingMessage, res: ServerResponse, url: URL, dir: string, rest: string) => {
    const doc = await documentOf(dir)
    const own = options.context(dir, doc)
    const [first, ...others] = rest.split('/')
    if (doc.config.renderers.slides !== undefined) {
      const lang = first && others.length > 0 && translationOf(dir, first) ? first : ''
      const path = lang ? others.join('/') : rest
      if (path === 'slides' || path === 'slides/' || path === 'slides/index.html') return documentPageResponse(res, dir, lang, '', 'slides', url.searchParams.get('presmium-block') ?? undefined)
    }
    if (formOf(url) === 'slides' && (rest === '' || rest === 'index.html')) return documentPageResponse(res, dir, '', undefined, 'slides', url.searchParams.get('presmium-block') ?? undefined)
    if (first && others.length > 0 && translationOf(dir, first)) return documentPageResponse(res, dir, first, others.join('/'), formOf(url), url.searchParams.get('presmium-block') ?? undefined)
    if (rest === '' || rest.endsWith('.html')) {
      const pages = webPages(published(dir, doc).doc)
      if (pageAt(pages, rest)) return documentPageResponse(res, dir, '', rest, formOf(url), url.searchParams.get('presmium-block') ?? undefined)
    }
    if (rest.startsWith('media/')) return serveFile(req, res, join(options.workDir, 'media', segment(dir)), `/${rest.split('/').map(encodeURIComponent).join('/')}`, false)
    const state = stateOf(dir)
    state.assets ??= runtimeAssets(options.nodePlugins(dir), own)
    const asset = findRuntimeAsset(await state.assets, rest)
    if (asset) {
      res.writeHead(200, { 'Content-Type': asset.type })
      return void createReadStream(asset.file).pipe(res)
    }
    const file = join(own.deckDir, 'public', rest)
    if (rest && existsSync(file) && statSync(file).isFile()) return serveFile(req, res, join(own.deckDir, 'public'), `/${rest.split('/').map(encodeURIComponent).join('/')}`, false)
    return plainPage(res, 'missing')
  }

  /** The workspace's own pages: its home page (the list, when its home page is a document), in its languages. */
  const siteRoute = async (res: ServerResponse, rest: string) => {
    const site = options.site()
    const target = homeDocument(site)
    const landing = landingDocument(site)
    const [first, ...others] = rest.split('/')
    const lang = first && others.length <= 1 && siteLanguages(site, siteLanguage(site, ctx.lang)).some(other => other.lang === first) ? first : undefined
    const own = lang ? others.join('/') : rest
    if (own === '' || own === 'index.html') {
      if (landing) {
        if (lang && !translationOf(landing.dir, lang)) {
          res.writeHead(302, { Location: base, 'Cache-Control': 'no-store' })
          return void res.end()
        }
        return documentPageResponse(res, landing.dir, lang ?? '', '', 'web', undefined, true)
      }
      if (target) {
        res.writeHead(302, { 'Location': `${documentBase(base, target.dir)}${lang ? `${lang}/` : ''}`, 'Cache-Control': 'no-store' })
        return void res.end()
      }
      return plainPage(res, 'home', lang, site.config.landing !== undefined)
    }
    if ((target || site.config.landing !== undefined) && own === `${LIST_PAGE}.html`) return plainPage(res, 'home', lang)
    return plainPage(res, 'missing')
  }

  const route = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://site')
    const path = url.pathname
    if (!path.startsWith(base)) return plainPage(res, 'missing')
    // The app's routes by the address as it is (their segments name directories as encoded); the documents' by their names.
    const raw = path.slice(base.length)
    if (raw.startsWith(PREFIX)) return appRoute(req, res, url, raw.slice(PREFIX.length))
    if (raw.startsWith('_landing/')) {
      const output = [...templateOutputs].find(dir => existsSync(join(dir, safeDecodeURIComponent(raw))))
      if (output) return serveFile(req, res, output, `/${raw}`, false)
    }
    const rest = safeDecodeURIComponent(raw)
    const listed = documents()
    const dir = listed.filter(d => d === '' || rest === d || rest.startsWith(`${d}/`)).sort((a, b) => b.length - a.length)[0]
    if (dir !== undefined && rest === dir && dir !== '') {
      // A document's directory without its slash: its pages' relative links need it.
      res.writeHead(301, { Location: `${path}/` })
      return void res.end()
    }
    if (dir === undefined) {
      const publicRoot = join(ctx.workspaceRoot, 'public'), file = join(publicRoot, rest)
      if (rest && existsSync(file) && statSync(file).isFile() && isInside(realpathSync(file), realpathSync(publicRoot))) return serveFile(req, res, publicRoot, `/${raw}`, false)
      return siteRoute(res, rest)
    }
    return documentRoute(req, res, url, dir, dir ? rest.slice(dir.length + 1) : rest)
  }

  // `presmium dev`: the Presmium server's routes below `/__presmium/`, WebSockets included, as the page's own.
  const agent = new Agent({ keepAlive: true, maxSockets: 64 })
  const proxy = ctx.server ? createProxyServer({ ws: true, xfwd: false, agent, target: ctx.server.url }) : undefined
  proxy?.on('error', (error: Error, _req: unknown, res: unknown) => {
    const response = res as ServerResponse | Duplex | undefined
    if (response && 'writeHead' in response && !response.headersSent) response.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`the Presmium server did not answer: ${error.message}`)
    else response?.destroy?.()
  })

  mkdirSync(options.workDir, { recursive: true })
  const server = createServer((req, res) => {
    const refused = localRequestRefusal(req.headers)
    if (refused) return void res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end(refused)
    if (proxy && req.url?.startsWith(SERVER_PROXY)) return void proxy.web(req, res)
    if (req.method !== 'GET' && req.method !== 'HEAD' && !req.url?.startsWith(`${base}${PREFIX}source`)) return void res.writeHead(405).end()
    route(req, res).catch((error: unknown) => {
      if (res.headersSent) return res.destroy()
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`the site could not answer: ${errorMessage(error)}`)
    })
  })
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!proxy || localRequestRefusal(req.headers) || !req.url?.startsWith(SERVER_PROXY)) return socket.destroy()
    proxy.ws(req, socket, head)
  })
  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.listen.port, options.listen.host, () => resolve((server.address() as AddressInfo).port))
  })
  const origin = `http://${options.listen.host === '0.0.0.0' || options.listen.host === '::' ? '127.0.0.1' : options.listen.host}:${port}`

  return {
    url: `${origin}${base}`,
    origin,
    update(dir, doc) {
      if (closed) return
      latest.set(dir, doc)
      const state = states.get(dir)
      if (!state) return
      const previous = new Map(state.published)
      // The plugins' run-time files follow their configuration of the document.
      state.assets = undefined
      for (const key of [...state.published.keys()].filter(key => !key.endsWith(':'))) state.published.delete(key)
      // Compare each language's own snapshot: a translation may change while the original stays identical.
      const changes = new Map<string, DevUpdateEvent | undefined>()
      for (const listener of state.listeners) {
        const { form, lang } = listener
        const key = `${form}:${lang}`
        if (!changes.has(key)) {
          const shown = lang ? translationOf(dir, lang)?.doc : doc
          const before = previous.get(key)
          const after = shown && published(dir, shown, lang, form)
          const update = !lang && before && after ? diffDocuments(before.doc, after.doc) : undefined
          changes.set(key, after && after.revision !== before?.revision ? { revision: after.revision, ...update && before ? { base: before.revision, update } : {} } : undefined)
        }
        const change = changes.get(key)
        if (change) listener.res.write(`event: ${UPDATE_EVENT}\ndata: ${JSON.stringify(change)}\n\n`)
      }
    },
    async app(dir, wait = false) {
      if (closed || !documents().includes(dir)) return undefined
      const started = Date.now()
      const { ready, done } = await prepare(dir)
      const cached = ready()
      if (wait && !ready()) {
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([done, new Promise(resolve => timer = setTimeout(resolve, WAIT_MS))])
        clearTimeout(timer)
      }
      const available = ready() && (!wait || await currentDocumentBundle(dir, await documentOf(dir)))
      // A build still running when the wait ends is not a failure: the workbench asks again.
      const preparing = !available && (building !== undefined || stateOf(dir).building !== undefined)
      log(`[viewer] document=${JSON.stringify(dir || '.')} cache=${cached ? 'hit' : 'miss'} wait=${wait} state=${available ? 'ready' : preparing || !wait ? 'building' : 'failed'} elapsedMs=${Date.now() - started}`)
      if (wait && preparing) throw new PreviewPreparing()
      if (wait && !available) throw new Error(stateOf(dir).bundleFailure ?? appFailure ?? 'the viewer app or the current document code could not be built; the server\'s log says why')
      return available ? `${base}${PREFIX}view?document=${encodeURIComponent(dir)}` : undefined
    },
    async warm(dir) {
      if (closed || !documents().includes(dir)) return
      await (await prepare(dir)).done
    },
    async close() {
      closed = true
      worker.close()
      for (const state of states.values()) {
        state.watcher?.close()
        clearTimeout(state.timer)
        for (const { res } of state.listeners) res.end()
        state.listeners.clear()
      }
      proxy?.close()
      agent.destroy()
      await new Promise<void>((done) => {
        server.close(() => done())
        server.closeAllConnections()
      })
    },
  }
}

/** Whether a path of the site is the viewer app's own. */
export function isAppPath(base: string, path: string): boolean {
  return path.startsWith(`${base}${PREFIX}`)
}
