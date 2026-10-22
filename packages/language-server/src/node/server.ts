import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { sectionLinks, webPages } from '@lincyaw/web/domain'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { createConnection, DidChangeWatchedFilesNotification, ProposedFeatures, TextDocuments, TextDocumentSyncKind } from 'vscode-languageserver/node'
import { anchorAt, findSectionAtLine, PREVIEW_REQUEST, SECTION_REQUEST } from '../domain/index.ts'
import type { DocumentParams, PositionParams, Preview, SectionLocation } from '../domain/index.ts'
import { anchorDefinition, anchorHover } from './anchors.ts'
import { complete } from './completion.ts'
import { Decks } from './decks.ts'
import type { Deck } from './decks.ts'
import { DevServerLauncher } from './dev-server-launcher.ts'
import { diagnosticsByFile } from './diagnostics.ts'
import { directiveCatalog } from './directive-catalog.ts'

const COMPILE_DELAY = 50

function fileOf(uri: string): string | undefined {
  return uri.startsWith('file:') ? fileURLToPath(uri) : undefined
}

export function startServer(): void {
  const connection = createConnection(ProposedFeatures.all)
  const documents = new TextDocuments(TextDocument)
  const devServers = new DevServerLauncher(line => connection.console.log(line))
  const published = new Map<Deck, Set<string>>()
  const timers = new Map<Deck, NodeJS.Timeout>()

  const bufferLines = (uri: string) => documents.get(uri)?.getText().split(/\r?\n/) ?? []
  const fileLines = (file: string): string[] => {
    try {
      return readFileSync(file, 'utf8').split(/\r?\n/)
    } catch {
      return []
    }
  }

  const publishDiagnostics = (deck: Deck) => {
    const byFile = diagnosticsByFile(deck.findings, deck.entry, fileLines)
    const files = new Set([...deck.compilation?.sourceFiles ?? [deck.entry], ...byFile.keys()])
    const uris = new Set([...files].map(file => pathToFileURL(file).href))
    for (const file of files) void connection.sendDiagnostics({ uri: pathToFileURL(file).href, diagnostics: byFile.get(file) ?? [] })
    for (const uri of published.get(deck) ?? []) {
      if (!uris.has(uri)) void connection.sendDiagnostics({ uri, diagnostics: [] })
    }
    published.set(deck, uris)
  }
  const decks = new Decks(publishDiagnostics)

  const changed = (files: string[]) => {
    for (const deck of decks.all().filter(d => files.some(file => d.dependsOn(file)))) {
      clearTimeout(timers.get(deck))
      timers.set(deck, setTimeout(() => void deck.compile(), COMPILE_DELAY))
    }
  }

  const deckOf = async (uri: string) => {
    const file = fileOf(uri)
    const deck = file ? await decks.findByFile(file) : undefined
    return file && deck?.compilation ? { file, deck, compilation: deck.compilation } : undefined
  }

  let watchFiles = false
  connection.onInitialize(({ capabilities }) => {
    watchFiles = capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration === true
    return {
      capabilities: {
        textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Incremental, save: { includeText: false } },
        definitionProvider: true,
        hoverProvider: true,
        completionProvider: { triggerCharacters: ['{', ':', '#', '/', ','] },
      },
      serverInfo: { name: 'presmium-language-server' },
    }
  })
  connection.onInitialized(() => {
    if (watchFiles) void connection.client.register(DidChangeWatchedFilesNotification.type, { watchers: [{ globPattern: '**/*' }] })
  })

  documents.onDidOpen(({ document }) => {
    const file = fileOf(document.uri)
    if (file) void decks.findByFile(file)
  })
  documents.onDidSave(({ document }) => {
    const file = fileOf(document.uri)
    if (file) changed([file])
  })
  connection.onDidChangeWatchedFiles(({ changes }) => changed(changes.flatMap(change => fileOf(change.uri) ?? [])))

  const anchorOf = async (uri: string, line: number) => {
    const found = await deckOf(uri)
    if (!found) return undefined
    const catalog = directiveCatalog(found.compilation)
    const ref = anchorAt(bufferLines(uri), line, found.compilation.resolvers.schemes(), catalog.anchors)
    return ref && { ...found, ref, t: catalog.t }
  }

  connection.onDefinition(async ({ textDocument, position }) => {
    const found = await anchorOf(textDocument.uri, position.line)
    return found ? anchorDefinition(found.compilation, found.ref) : null
  })

  connection.onHover(async ({ textDocument, position }) => {
    const found = await anchorOf(textDocument.uri, position.line)
    return found ? anchorHover(found.compilation, found.file, found.ref, found.t) : null
  })

  connection.onCompletion(async ({ textDocument, position }) => {
    const found = await deckOf(textDocument.uri)
    return found ? complete(found.compilation, bufferLines(textDocument.uri), position) : []
  })

  connection.onRequest(SECTION_REQUEST, async ({ textDocument, position }: PositionParams): Promise<SectionLocation | null> => {
    const found = await deckOf(textDocument.uri)
    const doc = found?.compilation.doc
    const section = doc && findSectionAtLine(doc, found.file, position.line + 1)
    if (!section) return null
    const link = sectionLinks(webPages(doc))[section.id] ?? '/'
    return { entry: found.deck.entry, id: section.id, index: section.index, title: section.title, link }
  })

  connection.onRequest(PREVIEW_REQUEST, async ({ textDocument }: DocumentParams): Promise<Preview> => {
    const file = fileOf(textDocument.uri)
    const deck = file ? await decks.findByFile(file) : undefined
    if (!deck) throw new Error(`${textDocument.uri} is not a source file of a Presmium deck`)
    return { entry: deck.entry, url: await devServers.urlOf(deck.entry) }
  })

  connection.onShutdown(() => devServers.close())
  process.once('exit', () => void devServers.close())

  documents.listen(connection)
  connection.listen()
}
