import { mkdirSync, readFileSync, watch } from 'node:fs'
import type { ChildProcess } from 'node:child_process'
import type { FSWatcher } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { errorMessage, previewFrameAncestors } from '@lincyaw/kernel'
import type { DocumentLink, IRDocument, NodeVitePlugin, RenderContext } from '@lincyaw/kernel'
import { spawnInteractiveNode } from '@lincyaw/kernel/node'
import send from 'send'
import { BUNDLE_ENTRY, findDocumentBundle } from './document-bundle.ts'
import type { DocumentBundle, DocumentBundleInput } from './document-bundle.ts'
import { PublicationCache, publishedDocument } from './publish.ts'
import { appPlugin, coreFingerprint, findViewerApp, sharedSpecifiers } from './viewer-app.ts'
import type { AppPlugin, ViewerApp } from './viewer-app.ts'
import type { ViewerBuildRequest } from './viewer-build.ts'
import { irRevisionOfJson } from './vite-plugins.ts'

/**
 * The viewer app as the workspace site's dev router serves it, below `<base>__app/`: a document's page (`view`), its IR
 * (`ir`) and its changes (`events`), the app's files (`v/<key>/`), the document's bundle (`d/<dir>/<key>/`) and media
 * (`m/<dir>/`). A document is shown there once the app has its plugins and its bundle is built; until then, and for a
 * document whose plugins the app cannot run, the preview is the document's dev server.
 */

const BUILD_SCRIPT = fileURLToPath(new URL('./viewer-build.ts', import.meta.url))
const PREFIX = '__app/'
// The fingerprints of sources are taken again at most this often.
const FINGERPRINT_MS = 3000
const CHANGE_MS = 200
const KEEPALIVE_MS = 25_000
// Files whose address names their content are cached a year.
const IMMUTABLE_MS = 365 * 24 * 3600_000
// A first preview waits this long for the app and the document's bundle to build, then is the dev server.
const WAIT_MS = 15_000
const IGNORED = /(?:^|[\\/])(?:node_modules|\.presmium|\.git|dist)(?:[\\/]|$)/

export interface ViewerServiceOptions {
  /** The site's base path, ending with `/`. */
  base: string
  /** Where viewer apps are kept, shared by every workspace. */
  cacheDir: string
  /** The workspace's own state: the documents' bundles and published media. */
  workDir: string
  workspaceRoot: string
  origins: string[]
  documents(): string[]
  /** The document as the site shows it (compiled when not yet). */
  document(dir: string): Promise<IRDocument>
  /** The document's render context, for publishing its IR and finding its plugins. */
  context(dir: string, doc: IRDocument): RenderContext
  nodePlugins(dir: string): NodeVitePlugin[] | undefined
  /** The page of a link to another document. */
  documentPage(link: DocumentLink): string | undefined
  log?(message: string): void
}

export interface ViewerService {
  /** Whether a request is for the viewer app; it is then answered. */
  handle(req: IncomingMessage, res: ServerResponse): boolean
  /**
   * The path of the document's page in the viewer app, once the app and the document's bundle are built: started when
   * missing, waited for (`wait`, a while) or not. None for a document whose plugins the app cannot run.
   */
  app(dir: string, wait?: boolean): Promise<string | undefined>
  /** Whether the app can show the document (its plugins' Vite plugins only give document modules). */
  supports(dir: string): Promise<boolean>
  /** The document changed: its pages read its IR again. */
  update(dir: string, doc: IRDocument): void
  close(): void
}

interface Published {
  source: IRDocument
  json: string
  revision: string
}

interface DocumentState {
  /** The document's bundle: none when it has no code of its own, unknown until looked for. */
  bundle?: DocumentBundle | null
  /** The modules the bundle imports by name: the app's. */
  externals?: readonly string[]
  building?: Promise<void>
  stale?: boolean
  watcher?: FSWatcher
  timer?: ReturnType<typeof setTimeout>
  published?: Published
  cache: PublicationCache
  listeners: Set<{ res: ServerResponse, app: string }>
}

const segment = (dir: string) => encodeURIComponent(dir || '.')

/**
 * Sends the file at `path` (URL-encoded, below `root`) through `send` (Express's): its type, ranges, validators and
 * conditional requests as HTTP defines them; immutable when its address names its content.
 */
function serveFile(req: IncomingMessage, res: ServerResponse, root: string, path: string, immutable: boolean): void {
  send(req, path, { root, ...immutable ? { maxAge: IMMUTABLE_MS, immutable: true } : {}, index: false })
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
 * The process that builds the viewer app and the documents' bundles, apart from the workspace service, which stays
 * responsive: started on the first build, at the interactive budget (the author may be waiting), and kept for the next.
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

export function createViewerService(options: ViewerServiceOptions): ViewerService {
  const { base } = options
  const states = new Map<string, DocumentState>()
  const plugins = new Map<string, { plugin: Promise<AppPlugin>, at: number }>()
  const worker = createBuildWorker()
  let core = { value: coreFingerprint(), at: Date.now() }
  let current: ViewerApp | undefined
  // The apps whose pages show code since changed.
  const outdated = new Set<string>()
  let building: Promise<void> | undefined
  let pending: AppPlugin[] | undefined
  let closed = false
  const log = options.log ?? ((message: string) => console.warn(`[presmium] ${message}`))

  const stateOf = (dir: string): DocumentState => {
    let state = states.get(dir)
    if (!state) states.set(dir, state = { cache: new PublicationCache(), listeners: new Set() })
    return state
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

  const documentPlugins = async (dir: string, doc: IRDocument): Promise<AppPlugin[]> => {
    const ctx = options.context(dir, doc)
    return await Promise.all(ctx.plugins.map(name => pluginAt(name, ctx.pluginDirs[name]!)))
  }

  const notify = (dir: string, event: string, which: (app: string) => boolean = () => true) => {
    for (const listener of states.get(dir)?.listeners ?? []) {
      if (which(listener.app)) listener.res.write(`event: ${event}\ndata: {}\n\n`)
    }
  }

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
    for (const dir of states.keys()) notify(dir, 'reload', key => outdated.has(key))
  }

  /** Whether the current app has these plugins as they are now. */
  const hasPlugins = (wanted: readonly AppPlugin[]) =>
    current !== undefined && current.manifest.core === coreNow() && wanted.every(p => current!.manifest.plugins[p.name] === p.fingerprint)

  /** Builds the app with these plugins, one build at a time; the pages of an older app reload. */
  const buildApp = (wanted: AppPlugin[]): Promise<void> => {
    pending = wanted
    building ??= (async () => {
      while (pending && !closed) {
        const plugins = pending
        pending = undefined
        if (hasPlugins(plugins)) continue
        const started = Date.now()
        try {
          const app = await worker.run<ViewerApp>({ kind: 'app', cacheDir: options.cacheDir, plugins })
          if (closed) return
          replace(app)
          log(`the viewer app was built in ${((Date.now() - started) / 1000).toFixed(1)} s`)
        } catch (error) {
          log(`the viewer app could not be built: ${errorMessage(error)}`)
        }
      }
    })().finally(() => {
      building = undefined
    })
    return building
  }

  const bundleInput = (dir: string, externals: readonly string[]): DocumentBundleInput => ({
    deckDir: join(options.workspaceRoot, dir),
    workspaceRoot: options.workspaceRoot,
    outDir: join(options.workDir, 'bundles', segment(dir)),
    externals: [...externals],
    nodePlugins: (options.nodePlugins(dir) ?? []).map(({ entry, config }) => ({ entry, config })),
  })

  /** Watches the document's files: when its code changes, its bundle is built again and its pages reload. */
  const watchDocument = (dir: string, state: DocumentState) => {
    if (state.watcher || closed) return
    try {
      state.watcher = watch(join(options.workspaceRoot, dir), { recursive: true }, (_event, name) => {
        if (!name || IGNORED.test(name.toString())) return
        clearTimeout(state.timer)
        state.timer = setTimeout(() => void refreshBundle(dir, state), CHANGE_MS)
      })
      state.watcher.on('error', () => undefined)
    } catch {}
  }

  /** Finds the bundle of the document's files as they are now, or builds it; its pages reload when it changed. */
  const refreshBundle = async (dir: string, state: DocumentState) => {
    if (closed || state.externals === undefined) return
    if (state.building) {
      state.stale = true
      return
    }
    const { externals } = state
    const found = await findDocumentBundle(bundleInput(dir, externals)).catch(() => undefined)
    if (found === undefined) return void buildBundle(dir, state, externals).then(() => notify(dir, 'reload'))
    if ((found?.key ?? null) === (state.bundle?.key ?? null)) return
    state.bundle = found
    notify(dir, 'reload')
  }

  /** Builds the document's bundle importing `externals` by name; it is kept when they are still the ones wanted. */
  const buildBundle = (dir: string, state: DocumentState, externals: readonly string[]): Promise<void> => {
    state.building ??= (async () => {
      const started = Date.now()
      try {
        const bundle = await worker.run<DocumentBundle | null>({ kind: 'document', input: bundleInput(dir, externals) })
        if (state.externals === externals) state.bundle = bundle
        if (bundle) log(`the code of ${dir || '.'} was bundled in ${((Date.now() - started) / 1000).toFixed(1)} s`)
      } catch (error) {
        log(`the code of ${dir || '.'} could not be bundled: ${errorMessage(error)}`)
      } finally {
        state.building = undefined
        if (state.stale) {
          state.stale = false
          void refreshBundle(dir, state)
        }
      }
    })()
    return state.building
  }

  /**
   * Prepares what the app needs to show the document: the app with its plugins and the document's bundle, built at the
   * same time (the modules the bundle imports by name are known before the app is built). Unsupported: its plugins have
   * Vite plugins of their own that the app cannot run.
   */
  const prepare = async (dir: string): Promise<{ supported: boolean, ready: () => boolean, done: Promise<unknown> }> => {
    const doc = await options.document(dir)
    const wanted = await documentPlugins(dir, doc)
    if (wanted.some(plugin => !plugin.supported)) return { supported: false, ready: () => false, done: Promise.resolve() }
    let externals: string[]
    let appBuilt: Promise<unknown> = Promise.resolve()
    if (!hasPlugins(wanted)) {
      const found = findViewerApp(options.cacheDir, coreNow(), wanted)
      if (found) replace(found)
    }
    if (hasPlugins(wanted)) externals = Object.keys(current!.manifest.shared)
    else {
      // The app has the plugins of the documents shown before too, so that it serves them all.
      const seen = await Promise.all([...states.keys()].filter(other => other !== dir).map(async other => documentPlugins(other, await options.document(other)).catch(() => [])))
      const all = [...new Map([...seen.flat().filter(p => p.supported), ...wanted].map(p => [p.name, p])).values()]
      appBuilt = buildApp(all)
      externals = Object.keys(sharedSpecifiers(all))
    }
    const state = stateOf(dir)
    watchDocument(dir, state)
    // A bundle that imports some of the app's modules by name runs with it; one that bundled any of them is built again.
    if (!importsOnly(state.externals, externals)) {
      state.externals = externals
      state.bundle = undefined
    }
    if (state.bundle === undefined && !state.building) {
      const found = await findDocumentBundle(bundleInput(dir, externals)).catch(() => undefined)
      if (found !== undefined) state.bundle = found
      else void buildBundle(dir, state, externals)
    }
    const ready = () => hasPlugins(wanted) && state.bundle !== undefined && importsOnly(state.externals, Object.keys(current!.manifest.shared))
    return { supported: true, ready, done: Promise.all([appBuilt, state.building]) }
  }

  const app = async (dir: string, wait = false): Promise<string | undefined> => {
    if (closed || !options.documents().includes(dir)) return undefined
    const { ready, done } = await prepare(dir)
    if (wait && !ready()) {
      let timer: ReturnType<typeof setTimeout> | undefined
      await Promise.race([done, new Promise(resolve => timer = setTimeout(resolve, WAIT_MS))])
      clearTimeout(timer)
    }
    return ready() ? `${base}${PREFIX}view?document=${encodeURIComponent(dir)}` : undefined
  }

  const published = (dir: string, doc: IRDocument): Published => {
    const state = stateOf(dir)
    if (state.published?.source === doc) return state.published
    const ctx = options.context(dir, doc)
    const json = JSON.stringify(publishedDocument(doc, ctx, join(options.workDir, 'media', segment(dir)), `${base}${PREFIX}m/${segment(dir)}/`, options.documentPage, state.cache))
    state.published = { source: doc, json, revision: irRevisionOfJson(json) }
    return state.published
  }

  const page = (dir: string, view: ViewerApp, bundle: DocumentBundle | null | undefined): string => {
    const root = `${base}${PREFIX}v/${view.manifest.key}/`
    const imports = Object.fromEntries(Object.entries(view.manifest.shared).map(([specifier, file]) => [specifier, `${root}${file}`]))
    const config = {
      document: dir,
      ir: `${base}${PREFIX}ir?document=${encodeURIComponent(dir)}`,
      events: `${base}${PREFIX}events?document=${encodeURIComponent(dir)}&app=${view.manifest.key}`,
      ...bundle ? { bundle: `${base}${PREFIX}d/${segment(dir)}/${bundle.key}/${BUNDLE_ENTRY}` } : {},
      origins: options.origins,
    }
    const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c')
    const head = `<base href="${root}">
    <script type="importmap">${json({ imports })}</script>
    <script type="application/json" id="presmium-app">${json(config)}</script>`
    return readFileSync(join(view.dir, 'index.html'), 'utf8').replace(/<head>/i, `<head>\n    ${head}`)
  }

  const fallback = (res: ServerResponse, dir: string, search: URLSearchParams) => {
    search.delete('document')
    const query = search.toString()
    res.writeHead(302, { 'Location': `${base}${dir ? `${dir.split('/').map(encodeURIComponent).join('/')}/` : ''}${query ? `?${query}` : ''}`, 'Cache-Control': 'no-store' }).end()
  }

  const view = async (res: ServerResponse, url: URL) => {
    const dir = url.searchParams.get('document') ?? ''
    const ready = await app(dir, true).catch(() => undefined)
    const state = states.get(dir)
    if (!ready || !current || !state) return fallback(res, dir, url.searchParams)
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': previewFrameAncestors(options.origins),
    })
    res.end(page(dir, current, state.bundle))
  }

  const ir = async (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const dir = url.searchParams.get('document') ?? ''
    if (!options.documents().includes(dir)) return void res.writeHead(404).end()
    const answer = published(dir, await options.document(dir))
    const etag = `"${answer.revision}"`
    if (req.headers['if-none-match'] === etag) return void res.writeHead(304, { 'ETag': etag, 'Cache-Control': 'no-store' }).end()
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'ETag': etag, 'Cache-Control': 'no-store' })
    res.end(`{"revision":${JSON.stringify(answer.revision)},"doc":${answer.json}}`)
  }

  const events = (req: IncomingMessage, res: ServerResponse, url: URL) => {
    const dir = url.searchParams.get('document') ?? ''
    if (!options.documents().includes(dir)) return void res.writeHead(404).end()
    const listener = { res, app: url.searchParams.get('app') ?? '' }
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

  const route = async (req: IncomingMessage, res: ServerResponse, url: URL, rest: string) => {
    if (rest === 'view') return await view(res, url)
    if (rest === 'ir') return await ir(req, res, url)
    if (rest === 'events') return events(req, res, url)
    const [kind, ...parts] = rest.split('/')
    const below = (n: number) => `/${parts.slice(n).join('/')}`
    if (kind === 'v' && parts.length >= 2) return serveFile(req, res, join(options.cacheDir, parts[0]!), below(1), true)
    if (kind === 'd' && parts.length >= 3) return serveFile(req, res, join(options.workDir, 'bundles', parts[0]!, parts[1]!), below(2), true)
    if (kind === 'm' && parts.length >= 2) return serveFile(req, res, join(options.workDir, 'media', parts[0]!), below(1), false)
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found')
  }

  mkdirSync(options.workDir, { recursive: true })
  return {
    handle(req, res) {
      const url = new URL(req.url ?? '/', 'http://site')
      if (!url.pathname.startsWith(`${base}${PREFIX}`) || (req.method !== 'GET' && req.method !== 'HEAD')) return false
      route(req, res, url, url.pathname.slice(base.length + PREFIX.length)).catch((error: unknown) => {
        if (res.headersSent) return res.destroy()
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`the viewer could not answer: ${errorMessage(error)}`)
      })
      return true
    },
    app,
    async supports(dir) {
      if (closed || !options.documents().includes(dir)) return false
      const doc = await options.document(dir)
      return (await documentPlugins(dir, doc)).every(plugin => plugin.supported)
    },
    update(dir) {
      notify(dir, 'ir')
    },
    close() {
      closed = true
      worker.close()
      for (const state of states.values()) {
        state.watcher?.close()
        clearTimeout(state.timer)
        for (const { res } of state.listeners) res.end()
        state.listeners.clear()
      }
    },
  }
}

/** Whether a path of the site is the viewer app's. */
export function isViewerPath(base: string, path: string): boolean {
  return path.startsWith(`${base}${PREFIX}`)
}
