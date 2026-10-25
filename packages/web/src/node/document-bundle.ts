import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { PresmiumNodePlugin } from '@lincyaw/kernel'
import { collectBrowserModules, deckPackage, emptyClientModules } from './client-modules.ts'
import { quietDirectives } from './viewer-app.ts'

/**
 * A document's own browser code, apart from the viewer app that shows it: its components, browser and viewer plugins,
 * and the document modules its plugins generate for it (`PresmiumNodePlugin.documentModules`), as one small bundle that
 * imports React, Presmium's packages and the plugins' public subpaths by name, from the app, through its import map.
 */

const BUNDLE_MANIFEST = 'bundle.json'
export const BUNDLE_ENTRY = 'document.js'
const DOCUMENT_MODULE = '\0presmium-document-bundle:'
const KEEP = 3

export interface DocumentBundleInput {
  deckDir: string
  workspaceRoot: string
  /** Where the document's bundles are kept, each in a directory by its key. */
  outDir: string
  /** The specifiers the app's import map names: never bundled. */
  externals: string[]
  /** The Node entries of the document's plugins, with their configuration, for their document modules. */
  nodePlugins: { entry: string, config: Record<string, unknown> }[]
}

export interface DocumentBundle {
  key: string
  dir: string
  /** The files the bundle was built from, by path, with their size and time then. */
  inputs: Record<string, string>
  restartable: boolean
  /** The names of the document's own components. */
  components: string[]
}

interface DocumentCode {
  key: string
  entry: string
  components: string[]
  /** The document modules' sources, by id. */
  generated: Record<string, string>
  restartable: boolean
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
  const generated: Record<string, string> = {}
  for (const { entry, config } of input.nodePlugins) {
    const plugin = (await import(pathToFileURL(entry).href) as { default?: PresmiumNodePlugin }).default
    Object.assign(generated, plugin?.documentModules?.({ deckDir: input.deckDir, workspaceRoot: input.workspaceRoot, config }) ?? {})
  }
  if (modules.components.size + modules.plugins.length + modules.viewers.length + Object.keys(generated).length === 0) return undefined
  const load = (file: string) => `() => import(${JSON.stringify(file)})`
  const ids = Object.keys(generated)
  const entry = `${ids.map((id, i) => `import module${i} from ${JSON.stringify(id)}\n`).join('')}
export const components = {
${[...modules.components].map(([name, file]) => `  ${JSON.stringify(name)}: ${load(file)},`).join('\n')}
}
export const plugins = [${modules.plugins.map(load).join(', ')}]
export const viewers = [${modules.viewers.map(({ name, file }) => `{ name: ${JSON.stringify(name)}, load: ${load(file)} }`).join(', ')}]
export const documentModules = {
${ids.map((id, i) => `  ${JSON.stringify(id)}: module${i},`).join('\n')}
}
export const restartable = ${modules.restartable}
`
  const key = createHash('sha256').update(JSON.stringify([input.externals.toSorted(), entry, generated])).digest('hex').slice(0, 16)
  return { key, entry, generated, restartable: modules.restartable, components: [...modules.components.keys()] }
}

function readBundle(dir: string): DocumentBundle | undefined {
  try {
    const bundle = JSON.parse(readFileSync(join(dir, BUNDLE_MANIFEST), 'utf8')) as DocumentBundle
    return Object.entries(bundle.inputs).every(([file, known]) => stamp(file) === known) ? { ...bundle, components: bundle.components ?? [], dir } : undefined
  } catch {
    return undefined
  }
}

/** The newest bundle of the document's code (`key`) built from its files as they are now. */
function freshBundle(outDir: string, key: string): DocumentBundle | undefined {
  let entries: string[]
  try {
    entries = readdirSync(outDir).filter(entry => entry.startsWith(`${key}-`))
  } catch {
    return undefined
  }
  const builds = entries.map(entry => ({ dir: join(outDir, entry), time: statSync(join(outDir, entry)).mtimeMs })).sort((a, b) => b.time - a.time)
  for (const { dir } of builds) {
    const bundle = readBundle(dir)
    if (bundle) return bundle
  }
  return undefined
}

/** The document's bundle as its files are now, if one was built from them. */
export async function findDocumentBundle(input: DocumentBundleInput): Promise<DocumentBundle | null | undefined> {
  const code = await documentCode(input)
  if (!code) return null
  return freshBundle(input.outDir, code.key)
}

/**
 * Builds the document's bundle (unless it is there already); none when the document has no code of its own. Its
 * directory is named by its code and its content, so that its files never change under their address.
 */
export async function buildDocumentBundle(input: DocumentBundleInput): Promise<DocumentBundle | null> {
  const code = await documentCode(input)
  if (!code) return null
  const known = freshBundle(input.outDir, code.key)
  if (known) return known
  const work = join(input.outDir, `.build-${code.key}-${process.pid}`)
  rmSync(work, { recursive: true, force: true })
  mkdirSync(work, { recursive: true })
  writeFileSync(join(work, 'entry.ts'), code.entry)
  const { generated } = code
  const externals = new Set(input.externals)
  const inputs: Record<string, string> = {}
  const { build } = await import('vite')
  await build({
    configFile: false,
    root: input.deckDir,
    base: './',
    logLevel: 'warn',
    mode: 'production',
    esbuild: { jsx: 'automatic' },
    publicDir: false,
    plugins: [
      {
        name: 'presmium:document-bundle',
        // Before Vite's own resolution: the app's modules stay imports by name.
        enforce: 'pre' as const,
        resolveId(id: string) {
          // Headmatter aliases already load the renamed plugins. Older document code must import the same shared
          // modules too, rather than resolving the removed packages or bundling a second copy of their runtime.
          const shared = externals.has(id) ? id : id.replace(/^@lincyaw\/slidev-addon-/, '@lincyaw/addon-')
          if (externals.has(shared)) return { id: shared, external: true }
          return generated[id] === undefined ? undefined : `${DOCUMENT_MODULE}${id}`
        },
        load(id: string) {
          return id.startsWith(DOCUMENT_MODULE) ? generated[id.slice(DOCUMENT_MODULE.length)] : undefined
        },
        generateBundle(_: unknown, bundle: Record<string, { type: string, moduleIds?: string[] }>) {
          for (const chunk of Object.values(bundle)) {
            for (const id of chunk.moduleIds ?? []) {
              const file = id.replace(/[?#].*$/s, '')
              if (!file.startsWith('\0') && !file.startsWith(work + sep) && !file.split(sep).includes('node_modules') && existsSync(file)) inputs[file] = stamp(file)
            }
          }
        },
        onLog: quietDirectives,
      },
    ],
    resolve: { dedupe: ['react', 'react-dom'] },
    build: {
      outDir: join(work, 'out'),
      emptyOutDir: true,
      target: 'es2022',
      reportCompressedSize: false,
      chunkSizeWarningLimit: 100_000,
      copyPublicDir: false,
      rollupOptions: {
        input: { document: join(work, 'entry.ts') },
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
  const content = createHash('sha256').update(readFileSync(join(work, 'out', BUNDLE_ENTRY))).digest('hex').slice(0, 8)
  const name = `${code.key}-${content}`
  const out = join(input.outDir, name)
  const bundle: DocumentBundle = { key: name, dir: out, inputs, restartable: code.restartable, components: code.components }
  writeFileSync(join(work, 'out', BUNDLE_MANIFEST), `${JSON.stringify(bundle, null, 2)}\n`)
  rmSync(out, { recursive: true, force: true })
  renameSync(join(work, 'out'), out)
  rmSync(work, { recursive: true, force: true })
  // The document's last few bundles stay, for pages still loading an earlier one.
  const builds = readdirSync(input.outDir).filter(entry => !entry.startsWith('.')).map(entry => ({ dir: join(input.outDir, entry), time: statSync(join(input.outDir, entry)).mtimeMs })).sort((a, b) => b.time - a.time)
  for (const old of builds.slice(KEEP)) rmSync(old.dir, { recursive: true, force: true })
  return bundle
}
