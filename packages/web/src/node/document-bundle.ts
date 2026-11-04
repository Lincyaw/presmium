import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { errorMessage, irBlocks } from '@lincyaw/kernel'
import type { Finding, IRDocument, PresmiumNodePlugin, RenderContext } from '@lincyaw/kernel'
import type { InlineConfig, Plugin } from 'vite'
import { collectBrowserModules, deckPackage, emptyClientModules, isRestartablePackage } from './client-modules.ts'
import { imageCache, ImageEncoder } from './images.ts'
import { appPlugin, quietDirectives, sharedSpecifiers } from './viewer-app.ts'

/**
 * A document's own browser code, apart from the viewer app that shows it: its components, browser and viewer plugins,
 * and the document modules its plugins generate for it (`PresmiumNodePlugin.documentModules`), as one small bundle that
 * imports React, Presmium's packages and the plugins' public subpaths by name, from the app, through its import map.
 *
 * A part the document loads when it shows it (a component, a scene, a plugin module: the modules the entry and the
 * document modules import) fails alone: when the whole does not bundle, each part is bundled by itself, and one that does
 * not bundle is loaded by a load that fails with why, so that the part shows its failure, as one failing at run time
 * does, and the rest of the document works. The bundle records these failures (`DocumentBundle.failures`), and
 * `codeFindings` reports them.
 */

const BUNDLE_MANIFEST = 'bundle.json'
export const BUNDLE_ENTRY = 'document.js'
const DOCUMENT_MODULE = '\0presmium-document-bundle:'
// The check of a document's code (`presmium check`) bundles it here, apart from the builds' and the dev servers' bundles.
const CHECK_DIR = '.presmium/web/check'
/** The findings of a document's code that does not bundle, the same in `presmium check`, a build and the preview. */
export const CODE_CHECK = 'presmium.preview.code'
const KEEP = 3
// Failed imports are rechecked with the bundler resolver before reusing their diagnostics.
const FORMAT = 3

export interface DocumentBundleInput {
  deckDir: string
  workspaceRoot: string
  /** Where the document's bundles are kept, each in a directory by its key. */
  outDir: string
  /** The specifiers the app's import map names: never bundled. */
  externals: string[]
  /** The Node entries of the document's plugins, with their configuration, for their document modules. */
  nodePlugins: { entry: string, config: Record<string, unknown> }[]
  /** Canonical file implementations, registered by their derived runtime names. */
  components?: DocumentComponent[]
}

export interface DocumentComponent { name: string, file: string, exportName?: string }

/** Own React components are selected by the compiled definition, regardless of their directory. */
export function documentComponents(doc: IRDocument | undefined): DocumentComponent[] {
  const found = new Map<string, DocumentComponent>()
  for (const section of doc?.sections ?? []) for (const block of irBlocks(section.blocks)) {
    const node = block.node
    if (node.type !== 'component' || node.plugin !== 'deck' || !node.definition) continue
    // Other definition kinds are claimed by their plugins, rather than invoked as React components.
    if (node.definition.kind !== undefined && node.definition.kind !== 'component') continue
    const component = { name: node.name, file: node.definition.file, ...node.definition.exportName !== undefined ? { exportName: node.definition.exportName } : {} }
    const known = found.get(component.name)
    if (known && (known.file !== component.file || known.exportName !== component.exportName)) throw new Error(`Document component ${component.name} names multiple implementations.`)
    found.set(component.name, component)
  }
  return [...found.values()]
}

export interface DocumentBundle {
  key: string
  dir: string
  /** The files the bundle was built from, by path, with their size and time then. */
  inputs: Record<string, string>
  restartable: boolean
  /** The names of the document's own components. */
  components: string[]
  /**
   * What the entry loads, as its build records it: its chunks, those it may import later (scenes), by path in the
   * bundle, and the app's shared modules among their imports, by specifier. A page preloads them with the entry.
   */
  loads: { files: string[], shared: string[] }
  /** The document's code that does not bundle, left out: loading a part that imports it fails with why. */
  failures: CodeFailure[]
}

/** A file of the document's code that does not bundle: a scene with a syntax error, say, or one importing a module that cannot be found. */
export interface CodeFailure {
  /** The module of the part that fails with it (`''` when the whole fails). */
  module: string
  /** The file at fault and its line, when the bundler names them. */
  file?: string
  line?: number
  reason: string
  /** The module that cannot be found from `file`, when that is the reason. */
  missing?: string
}

interface OutputFile { type: string, fileName: string, isEntry?: boolean, imports?: string[], dynamicImports?: string[], moduleIds?: string[] }

interface BundlerError { message?: string, code?: string, exporter?: string, id?: string, loc?: { file?: string, line?: number }, errors?: BundlerError[] }

/** The line of `file` that imports `specifier`, if there is one. */
function importLine(file: string, specifier: string): { line?: number } {
  try {
    const at = readFileSync(file, 'utf8').split('\n').findIndex(text => ['"', '\'', '`'].some(quote => text.includes(`${quote}${specifier}${quote}`)))
    return at < 0 ? {} : { line: at + 1 }
  } catch {
    return {}
  }
}

/** What a bundler's error says failed, each failure with its file and line when the error names them. */
function bundlerFailures(error: unknown, module: string): CodeFailure[] {
  const listed = (error as BundlerError | undefined)?.errors
  return (Array.isArray(listed) && listed.length > 0 ? listed : [error as BundlerError]).map((one): CodeFailure => {
    const text = stripVTControlCharacters(typeof one?.message === 'string' ? one.message : errorMessage(one))
    const unresolved = /failed to resolve import "([^"]+)" from "([^"]+)"/.exec(text)
    if (unresolved) {
      const [, missing, file] = unresolved as unknown as [string, string, string]
      return { module, file, ...importLine(file, missing), reason: `${missing} cannot be found from this file`, missing }
    }
    // A code frame's heading names the file (from the working directory) and the line.
    const framed = /\[ ([^\s\]]+):(\d+):\d+ \]/.exec(text)
    const file = one?.id ?? one?.loc?.file ?? (framed ? resolve(framed[1]!) : undefined)
    const line = one?.loc?.line ?? (framed ? Number(framed[2]) : undefined)
    const reason = text.split('\n').map(part => part.replace(/^(?:Error:\s*|\[[^\]\s]+\]\s*)+/, '').trim()).find(part => part && !part.startsWith('Build failed')) ?? text
    const missing = one?.code === 'UNRESOLVED_IMPORT' && typeof one.exporter === 'string' ? one.exporter : undefined
    return { module, ...file && existsSync(file) ? { file } : {}, ...line ? { line } : {}, reason, ...missing ? { missing } : {} }
  })
}

const MISSING_HINT = 'Name the plugin that provides it in metadata.plugins, or add its package to the project’s dependencies.'
const posix = (path: string) => path.split(sep).join('/')

/** Why a module of the document fails, as the module put in its place throws it: its files from the document's directory. */
function failureText(failures: readonly CodeFailure[], deckDir: string): string {
  return failures.map(f => `${f.file ? `${posix(relative(deckDir, f.file))}${f.line ? `:${f.line}` : ''}: ` : ''}${f.reason}`).join('\n')
}

/** The document's code that does not bundle, as findings: one for each place at fault, with the modules it fails. */
export function codeFindings(failures: readonly CodeFailure[], deckDir: string): Finding[] {
  const places = new Map<string, { failure: CodeFailure, modules: Set<string> }>()
  for (const failure of failures) {
    const key = JSON.stringify([failure.file, failure.line, failure.reason])
    const known = places.get(key)
    if (known) known.modules.add(failure.module)
    else places.set(key, { failure, modules: new Set([failure.module]) })
  }
  return [...places.values()].map(({ failure, modules }) => {
    const importers = [...modules].filter(module => module && module !== failure.file).map(module => posix(relative(deckDir, module)))
    return {
      checkId: CODE_CHECK,
      severity: 'error',
      message: `the document's code could not be bundled: ${failure.reason}${importers.length ? ` (imported by ${importers.join(', ')})` : ''}`,
      ...failure.missing && !/^[./]/.test(failure.missing) ? { hint: MISSING_HINT } : {},
      ...failure.file ? { source: { file: failure.file, ...failure.line ? { line: failure.line } : {} } } : {},
    }
  })
}

/** The chunks an entry imports, at once or later, and the external modules among their imports. */
function entryLoads(bundle: Record<string, OutputFile>, externals: ReadonlySet<string>): DocumentBundle['loads'] {
  const byName = new Map(Object.values(bundle).map(file => [file.fileName, file]))
  const files = new Set<string>(), shared = new Set<string>()
  const visit = (name: string) => {
    if (externals.has(name)) shared.add(name)
    const file = byName.get(name)
    if (!file || files.has(name)) return
    files.add(name)
    for (const next of [...file.imports ?? [], ...file.dynamicImports ?? []]) visit(next)
  }
  for (const file of byName.values()) if (file.isEntry) visit(file.fileName)
  files.delete(BUNDLE_ENTRY)
  return { files: [...files], shared: [...shared] }
}

/** Why a module the document loads when it shows a part does not bundle, if it does not. */
type Failing = (file: string) => string | undefined

// A dynamic import that names its module, as Presmium's generated code writes it.
const IMPORTED = /\bimport\(\s*("(?:[^"\\]|\\.)*")\s*\)/g

/** How the document loads a part: its module, or, when that does not bundle, a load that fails with why. */
function loader(file: string, failing?: Failing, then = ''): string {
  const why = failing?.(file)
  return why === undefined ? `() => import(${JSON.stringify(file)})${then}` : `() => Promise.reject(new Error(${JSON.stringify(why)}))`
}

interface DocumentCode {
  key: string
  /** The entry; with `failing`, each part that does not bundle fails when loaded. */
  entry(failing?: Failing): string
  components: string[]
  /** The document modules' sources, by id. */
  generated: Record<string, string>
  restartable: boolean
  /** The files the entry and the document modules import when the document shows a part, as far as they name them. */
  parts: string[]
}

const stamp = (file: string) => {
  try {
    const { size, mtimeMs } = statSync(file)
    return `${size}:${Math.trunc(mtimeMs)}`
  } catch {
    return 'missing'
  }
}

/** The entry of the document's bundle and the key of what it is made of, or none when the document has no code of its own. */
async function documentCode(input: DocumentBundleInput): Promise<DocumentCode | undefined> {
  const modules = emptyClientModules()
  collectBrowserModules(input.deckDir, 'deck', modules, false, deckPackage(input.deckDir, input.workspaceRoot))
  const components = new Map([...modules.components].map(([name, file]) => [name, { file, exportName: 'default' }]))
  if (input.components?.length && !isRestartablePackage(deckPackage(input.deckDir, input.workspaceRoot))) modules.restartable = false
  for (const component of input.components ?? []) components.set(component.name, { file: resolve(input.deckDir, component.file), exportName: component.exportName ?? 'default' })
  const generated: Record<string, string> = {}
  for (const { entry, config } of input.nodePlugins) {
    const plugin = (await import(pathToFileURL(entry).href) as { default?: PresmiumNodePlugin }).default
    Object.assign(generated, plugin?.documentModules?.({ deckDir: input.deckDir, workspaceRoot: input.workspaceRoot, config }) ?? {})
  }
  if (components.size + modules.plugins.length + modules.viewers.length + Object.keys(generated).length === 0) return undefined
  const ids = Object.keys(generated)
  const entry = (failing?: Failing) => `${ids.map((id, i) => `import module${i} from ${JSON.stringify(id)}\n`).join('')}
export const components = {
${[...components].map(([name, { file, exportName }]) => `  ${JSON.stringify(name)}: ${loader(file, failing, `.then(module => { if (!module[${JSON.stringify(exportName)}]) throw new Error(${JSON.stringify(`Document component ${name} has no export ${exportName}.`)}); return { default: module[${JSON.stringify(exportName)}] } })`)},`).join('\n')}
}
export const plugins = [${modules.plugins.map(file => loader(file, failing)).join(', ')}]
export const viewers = [${modules.viewers.map(({ name, file }) => `{ name: ${JSON.stringify(name)}, load: ${loader(file, failing)} }`).join(', ')}]
export const documentModules = {
${ids.map((id, i) => `  ${JSON.stringify(id)}: module${i},`).join('\n')}
}
export const restartable = ${modules.restartable}
`
  const key = createHash('sha256').update(JSON.stringify([FORMAT, input.externals.toSorted(), entry(), generated])).digest('hex').slice(0, 16)
  const named = Object.values(generated).flatMap(source => [...source.matchAll(IMPORTED)].map(match => JSON.parse(match[1]!) as string))
  const parts = [...components.values()].map(({ file }) => file).concat(modules.plugins, modules.viewers.map(({ file }) => file), named)
  return { key, entry, generated, restartable: modules.restartable, components: [...components.keys()], parts: [...new Set(parts)].filter(file => existsSync(file)).map(file => realpathSync(file)) }
}

function readBundle(dir: string): DocumentBundle | undefined {
  try {
    const bundle = JSON.parse(readFileSync(join(dir, BUNDLE_MANIFEST), 'utf8')) as DocumentBundle
    return Object.entries(bundle.inputs).every(([file, known]) => stamp(file) === known) && bundle.loads ? { ...bundle, components: bundle.components ?? [], failures: bundle.failures ?? [], dir } : undefined
  } catch {
    return undefined
  }
}

/** The newest bundle of the document's code (`key`) built from its files as they are now. */
async function freshBundle(input: DocumentBundleInput, key: string): Promise<DocumentBundle | undefined> {
  const { outDir } = input
  let entries: string[]
  try {
    entries = readdirSync(outDir).filter(entry => entry.startsWith(`${key}-`))
  } catch {
    return undefined
  }
  const builds = entries.map(entry => ({ dir: join(outDir, entry), time: statSync(join(outDir, entry)).mtimeMs })).sort((a, b) => b.time - a.time)
  for (const { dir } of builds) {
    const bundle = readBundle(dir)
    if (!bundle) continue
    const missing = bundle.failures.filter((failure): failure is CodeFailure & { file: string, missing: string } => Boolean(failure.file && failure.missing))
    if (missing.length) {
      // A file or package may have appeared without changing any source the failed build read.
      const { BuildEnvironment, createIdResolver, resolveConfig } = await import('vite')
      const config = await resolveConfig({ configFile: false, root: input.deckDir, mode: 'production', logLevel: 'silent', resolve: { dedupe: ['react', 'react-dom'] } }, 'build')
      const environment = new BuildEnvironment('client', config)
      const resolve = createIdResolver(config)
      let recovered = false
      for (const failure of missing) if (await resolve(environment, failure.missing, failure.file).catch(() => undefined)) {
        recovered = true
        break
      }
      if (recovered) continue
    }
    return bundle
  }
  return undefined
}

/** The document's bundle as its files are now, if one was built from them. */
export async function findDocumentBundle(input: DocumentBundleInput): Promise<DocumentBundle | null | undefined> {
  const code = await documentCode(input)
  if (!code) return null
  return freshBundle(input, code.key)
}

/**
 * Builds the document's bundle (unless it is there already); none when the document has no code of its own. Its
 * directory is named by its code and its content, so that its files never change under their address.
 */
export async function buildDocumentBundle(input: DocumentBundleInput): Promise<DocumentBundle | null> {
  const code = await documentCode(input)
  if (!code) return null
  const known = await freshBundle(input, code.key)
  if (known) return known
  const work = join(input.outDir, `.build-${code.key}-${process.pid}`)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  // Vite resolves symlinks, including macOS's /var -> /private/var temporary paths.
  const realWork = realpathSync(work)
  writeFileSync(join(work, 'entry.ts'), code.entry())
  const { generated } = code
  const externals = new Set(input.externals)
  const inputs: Record<string, string> = {}
  // One of the document's own files, by its real path, with its size and time now: the bundle is current while it is.
  const keep = (path: string) => {
    const file = existsSync(path) ? realpathSync(path) : path
    if (!file.startsWith(realWork + sep) && !file.split(sep).includes('node_modules')) inputs[file] = stamp(file)
  }
  let loads: DocumentBundle['loads'] = { files: [], shared: [] }
  // The parts that do not bundle, by their module: the entry and the document modules load each with a load that fails
  // with why, not an import of a module that throws, which Vite's loader would take for a stale page and reload.
  const failed = new Map<string, CodeFailure[]>()
  const failing: Failing = (file) => {
    const failures = failed.get(existsSync(file) ? realpathSync(file) : file)
    return failures && failureText(failures, input.deckDir)
  }
  const images = new ImageEncoder(imageCache(input.workspaceRoot))
  /** The bundle's own part of the build; with `probe`, of a part bundled by itself, getting the files it loads. */
  const bundler = (probe?: Set<string>): Plugin => ({
    name: 'presmium:document-bundle',
    // Before Vite's own resolution: the app's modules stay imports by name.
    enforce: 'pre',
    resolveId(id) {
      // Headmatter aliases already load the renamed plugins. Older document code must import the same shared
      // modules too, rather than resolving the removed packages or bundling a second copy of their runtime.
      const shared = externals.has(id) ? id : id.replace(/^@lincyaw\/slidev-addon-/, '@lincyaw/addon-')
      if (externals.has(shared)) return { id: shared, external: true }
      return generated[id] === undefined ? undefined : `${DOCUMENT_MODULE}${id}`
    },
    load(id) {
      if (id.startsWith(DOCUMENT_MODULE)) {
        const source = generated[id.slice(DOCUMENT_MODULE.length)]!
        return failed.size === 0 ? source : source.replace(IMPORTED, (imported, name: string) => {
          const why = failing(JSON.parse(name) as string)
          return why === undefined ? imported : `Promise.reject(new Error(${JSON.stringify(why)}))`
        })
      }
      if (probe && isAbsolute(id)) probe.add(id.replace(/[?#].*$/s, ''))
      return undefined
    },
    generateBundle(_, output) {
      if (probe) return
      const bundle = output as unknown as Record<string, OutputFile>
      loads = entryLoads(bundle, externals)
      for (const chunk of Object.values(bundle)) {
        for (const id of chunk.moduleIds ?? []) {
          const file = id.replace(/[?#].*$/s, '')
          if (!file.startsWith('\0') && existsSync(file)) keep(file)
        }
      }
    },
    onLog: quietDirectives,
  })
  const { build, createLogger } = await import('vite')
  // A try of the whole that fails is followed by its parts bundled by themselves: its failure is not yet the build's.
  const logger = createLogger('warn')
  const customLogger = { ...logger, error: (message: string, options?: Parameters<typeof logger.error>[1]) => stripVTControlCharacters(message).includes('Build failed') ? undefined : logger.error(message, options) }
  const config = (entry: string, probe?: Set<string>): InlineConfig => ({
    configFile: false,
    root: input.deckDir,
    base: './',
    ...probe ? { logLevel: 'silent' } : { logLevel: 'warn', customLogger },
    mode: 'production',
    esbuild: { jsx: 'automatic' },
    publicDir: false,
    plugins: [bundler(probe), images.vitePlugin()],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: {
      outDir: join(work, probe ? 'part' : 'out'),
      emptyOutDir: !probe,
      ...probe ? { write: false } : {},
      target: 'es2022',
      reportCompressedSize: false,
      chunkSizeWarningLimit: 100_000,
      copyPublicDir: false,
      rollupOptions: {
        input: probe ? { part: entry } : { document: entry },
        preserveEntrySignatures: 'strict',
        output: {
          format: 'es',
          entryFileNames: BUNDLE_ENTRY,
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  })
  try {
    await build(config(join(work, 'entry.ts')))
  } catch (error) {
    // The whole does not bundle: each part is bundled by itself, and those that fail are left out of it.
    for (const part of code.parts) {
      if (part.split(sep).includes('node_modules')) continue
      const loaded = new Set<string>()
      try {
        await build(config(part, loaded))
      } catch (failure) {
        const failures = bundlerFailures(failure, part)
        failed.set(part, failures)
        // Bundled again when a file it loaded changes, or when a file it imports appears.
        for (const file of loaded) if (existsSync(file)) keep(file)
        for (const { file } of failures) if (file) keep(file)
      }
    }
    if (failed.size === 0) throw error
    writeFileSync(join(work, 'entry.ts'), code.entry(failing))
    await build(config(join(work, 'entry.ts')))
  }
  // A module that cannot be found may be installed since.
  const own = failed.size > 0 ? deckPackage(input.deckDir, input.workspaceRoot) : undefined
  if (own) keep(join(own, 'package.json'))
  const content = createHash('sha256').update(readFileSync(join(work, 'out', BUNDLE_ENTRY))).digest('hex').slice(0, 8)
  const name = `${code.key}-${content}`
  const out = join(input.outDir, name)
  const bundle: DocumentBundle = { key: name, dir: out, inputs, restartable: code.restartable, components: code.components, loads, failures: [...failed.values()].flat() }
  writeFileSync(join(work, 'out', BUNDLE_MANIFEST), `${JSON.stringify(bundle, null, 2)}\n`)
  rmSync(out, { recursive: true, force: true })
  renameSync(join(work, 'out'), out)
  rmSync(work, { recursive: true, force: true })
  // The document's last few bundles stay, for pages still loading an earlier one.
  const builds = readdirSync(input.outDir).filter(entry => !entry.startsWith('.')).map(entry => ({ dir: join(input.outDir, entry), time: statSync(join(input.outDir, entry)).mtimeMs })).sort((a, b) => b.time - a.time)
  for (const old of builds.slice(KEEP)) rmSync(old.dir, { recursive: true, force: true })
  return bundle
}

/**
 * The web and slides renderers' check (`Renderer.check`): the document's own code bundled as its pages load it, importing
 * Presmium's modules and those of the document's plugins by name (from Presmium's installation, as the app does), and
 * each file of it that does not bundle reported as `codeFindings` reports it.
 */
export async function checkDocumentCode(doc: IRDocument, ctx: RenderContext): Promise<Finding[]> {
  const plugins = await Promise.all(Object.entries(ctx.pluginDirs).filter(([, dir]) => dir).map(([name, dir]) => appPlugin(name, dir)))
  const input: DocumentBundleInput = {
    deckDir: ctx.deckDir,
    workspaceRoot: ctx.workspaceRoot,
    outDir: join(ctx.deckDir, CHECK_DIR),
    externals: Object.keys(sharedSpecifiers(plugins)),
    nodePlugins: (ctx.nodeVitePlugins ?? []).map(({ entry, config }) => ({ entry, config })),
    components: documentComponents(doc),
  }
  try {
    return codeFindings((await buildDocumentBundle(input))?.failures ?? [], ctx.deckDir)
  } catch (error) {
    return codeFindings(bundlerFailures(error, ''), ctx.deckDir)
  }
}
