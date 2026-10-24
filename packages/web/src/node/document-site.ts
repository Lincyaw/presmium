import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { docBlocks } from '@lincyaw/kernel'
import type { IRDocument, RenderContext } from '@lincyaw/kernel'
import { diffDocuments } from '@lincyaw/viewer/domain'
import launchEditor from 'launch-editor'
import { offlineEnabled, rendererConfig } from '../domain/index.ts'
import { clientModules } from './client-modules.ts'
import type { ClientModules } from './client-modules.ts'
import { documentProjectFiles, writeDocumentProject } from './document-project.ts'
import type { WorkspaceOptions } from './document-project.ts'
import { writeServiceWorker } from './offline.ts'
import { PublicationCache, publishedDocument, publishedFile } from './publish.ts'
import type { DocumentPage } from './publish.ts'
import { irRevisionOfJson } from './vite-plugins.ts'
import { runVitepressBuild, startVitepressDev } from './vitepress-process.ts'
import { headImageUrl, writeIfChanged } from './vitepress-project.ts'

/** The source files of a document: those of its sections and of all their blocks. */
export function documentSourceFiles(doc: IRDocument): Set<string> {
  return new Set([...doc.sections.map(section => section.source.file), ...[...docBlocks(doc)].map(({ block }) => block.source.file)])
}

/** What a document's site has from the workspace site it is part of. */
export interface DocumentSite {
  workspace?: WorkspaceOptions
  extra?: ClientModules
  documentPage?: DocumentPage
  config?: string
}

function mergeClientModules(modules: ClientModules, extra?: ClientModules): ClientModules {
  if (!extra) return modules
  return {
    restartable: modules.restartable === true && extra.restartable === true,
    components: new Map([...extra.components, ...modules.components]),
    plugins: [...extra.plugins, ...modules.plugins],
    viewers: [...extra.viewers, ...modules.viewers],
    vite: [...extra.vite, ...modules.vite],
    nodeVite: [...extra.nodeVite, ...modules.nodeVite],
  }
}

function prepare(doc: IRDocument, ctx: RenderContext, workDir: string, document: DocumentSite = {}, incremental = false) {
  const options = rendererConfig(ctx)
  const files = documentProjectFiles(workDir)
  rmSync(files.publicDir, { recursive: true, force: true })
  const deck = { deckDir: ctx.deckDir, workspaceRoot: ctx.workspaceRoot }
  if (ctx.vitePlugins.length && ctx.nodeVitePlugins === undefined) throw new Error('the web renderer needs nodeVitePlugins entries to load the context\'s Vite plugins')
  const publication = incremental ? new PublicationCache() : undefined
  const publish = (d: IRDocument) => publishedDocument(d, ctx, files.publicDir, options.base, document.documentPage, publication)
  const image = headImageUrl(options.shell, url => publishedFile(ctx, files.publicDir, options.base, { file: document.config ?? resolve(ctx.deckDir, doc.meta.entry), line: 1 }, url))
  const writeProject = (published: IRDocument) => writeDocumentProject(workDir, {
    doc: published,
    deck,
    modules: mergeClientModules(clientModules(ctx, ctx.nodeVitePlugins ?? []), document.extra),
    options,
    workspace: document.workspace,
    translations: (ctx.translations ?? []).map(({ lang, doc: translated }) => ({ lang, doc: publish(translated) })),
    image,
    ...ctx.preview ? { preview: ctx.preview } : {},
  })
  return { options, files, publish, writeProject }
}

export async function buildDocument(doc: IRDocument, ctx: RenderContext, workDir: string, document: DocumentSite = {}): Promise<void> {
  const { options, files, publish, writeProject } = prepare(doc, ctx, workDir, document)
  const published = publish(doc)
  writeProject(published)
  writeIfChanged(join(files.publicDir, 'ir.json'), JSON.stringify(published))
  const code = await runVitepressBuild(files.root, ctx.outDir, ctx.log)
  if (code !== 0) throw new Error(`vitepress build exited with code ${code}`)
  if (offlineEnabled(doc.config.presmium)) writeServiceWorker(ctx.outDir, options.base)
}

export interface DocumentDevServer {
  port: number
  update(doc: IRDocument): Promise<void>
  close(): Promise<void>
}

export async function devDocument(doc: IRDocument, ctx: RenderContext, document: DocumentSite = {}, port?: number, listen: { host?: string, signal?: AbortSignal } = {}): Promise<DocumentDevServer> {
  const { options, files, publish, writeProject } = prepare(doc, ctx, ctx.outDir, document, true)
  let current = publish(doc)
  let irRevision = irRevisionOfJson(JSON.stringify(current))
  writeProject(current)
  const server = await startVitepressDev(files.root, port ?? options.port, (message) => {
    if (message.type !== 'presmium:source' || document.workspace || !documentSourceFiles(current).has(message.file)) return
    launchEditor(`${resolve(ctx.deckDir, message.file)}:${message.line}`, (file, error) => {
      console.error(`[presmium] could not open ${file} in an editor${error ? `: ${error}` : ''}; set $EDITOR or $LAUNCH_EDITOR`)
    })
  }, listen)
  return {
    port: server.port,
    async update(next: IRDocument) {
      const published = publish(next)
      const update = diffDocuments(current, published)
      writeProject(published)
      if (!update) {
        if (ctx.translations?.length) server.send({ type: 'presmium:translations' })
        return
      }
      const base = irRevision
      current = published
      irRevision = irRevisionOfJson(JSON.stringify(published))
      server.send({ type: 'presmium:update', update, base, revision: irRevision })
    },
    close: () => server.close(),
  }
}
