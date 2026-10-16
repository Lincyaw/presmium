/**
 * The Presmium language server (P-80, P-81). It compiles the deck of each
 * open source file with `@presmium/compiler` whenever a file the compilation
 * read is saved or changes, and publishes the diagnostics at their source
 * lines; it answers definitions, hovers and completions on the editor's
 * buffer against the latest compilation; and for the preview it runs
 * `presmium dev` and maps a cursor to its section.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { sectionLinks, toPages } from '@presmium/web/domain'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { createConnection, DidChangeWatchedFilesNotification, ProposedFeatures, TextDocuments, TextDocumentSyncKind } from 'vscode-languageserver/node'
import { anchorAt, PREVIEW_REQUEST, SECTION_REQUEST, sectionAt } from '../domain/index.ts'
import type { DocumentParams, PositionParams, Preview, SectionAt } from '../domain/index.ts'
import { anchorDefinition, anchorHover } from './anchors.ts'
import { complete } from './completion.ts'
import { Decks } from './decks.ts'
import type { Deck } from './decks.ts'
import { toDiagnostics } from './diagnostics.ts'
import { Previews } from './preview.ts'
import { deckSyntax } from './syntax.ts'

/** Saves and file events close together compile once. */
const COMPILE_DELAY = 50

function fileOf(uri: string): string | undefined {
  return uri.startsWith('file:') ? fileURLToPath(uri) : undefined
}

/** Starts the server on the transport named on the command line (`--stdio`, `--node-ipc`, `--socket=<port>`). */
export function startServer(): void {
  const connection = createConnection(ProposedFeatures.all)
  const documents = new TextDocuments(TextDocument)
  const previews = new Previews(line => connection.console.log(line))
  const published = new Map<Deck, Set<string>>()
  const timers = new Map<Deck, NodeJS.Timeout>()

  const bufferLines = (uri: string) => documents.get(uri)?.getText().split(/\r?\n/) ?? []
  // Findings are about the saved files the compiler read.
  const fileLines = (file: string): string[] => {
    try {
      return readFileSync(file, 'utf8').split(/\r?\n/)
    } catch {
      return []
    }
  }

  // Every source file of the deck gets its diagnostics, none for a clean file; so does a file that had some before.
  const publish = (deck: Deck) => {
    const byFile = toDiagnostics(deck.findings, deck.entry, fileLines)
    const files = new Set([...deck.compilation?.files ?? [deck.entry], ...byFile.keys()])
    const uris = new Set([...files].map(file => pathToFileURL(file).href))
    for (const file of files) void connection.sendDiagnostics({ uri: pathToFileURL(file).href, diagnostics: byFile.get(file) ?? [] })
    for (const uri of published.get(deck) ?? []) {
      if (!uris.has(uri)) void connection.sendDiagnostics({ uri, diagnostics: [] })
    }
    published.set(deck, uris)
  }
  const decks = new Decks(publish)

  /** Compiles again the decks that read one of the files. */
  const changed = (files: string[]) => {
    for (const deck of decks.all().filter(d => files.some(file => d.reads(file)))) {
      clearTimeout(timers.get(deck))
      timers.set(deck, setTimeout(() => void deck.compile(), COMPILE_DELAY))
    }
  }

  /** The deck of a document and its latest compilation. */
  const deckOf = async (uri: string) => {
    const file = fileOf(uri)
    const deck = file ? await decks.of(file) : undefined
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
  // Referenced code and the anchor lock change outside the editor too.
  connection.onInitialized(() => {
    if (watchFiles) void connection.client.register(DidChangeWatchedFilesNotification.type, { watchers: [{ globPattern: '**/*' }] })
  })

  documents.onDidOpen(({ document }) => {
    const file = fileOf(document.uri)
    if (file) void decks.of(file)
  })
  documents.onDidSave(({ document }) => {
    const file = fileOf(document.uri)
    if (file) changed([file])
  })
  connection.onDidChangeWatchedFiles(({ changes }) => changed(changes.flatMap(change => fileOf(change.uri) ?? [])))

  /** The anchor at a position of a document, with what its deck accepts and says. */
  const anchorOf = async (uri: string, line: number) => {
    const found = await deckOf(uri)
    if (!found) return undefined
    const syntax = deckSyntax(found.compilation)
    const ref = anchorAt(bufferLines(uri), line, found.compilation.resolvers.schemes(), syntax.anchors)
    return ref && { ...found, ref, t: syntax.t }
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

  connection.onRequest(SECTION_REQUEST, async ({ textDocument, position }: PositionParams): Promise<SectionAt | null> => {
    const found = await deckOf(textDocument.uri)
    const doc = found?.compilation.doc
    const section = doc && sectionAt(doc, found.file, position.line + 1)
    if (!section) return null
    const link = sectionLinks(toPages(doc))[section.id] ?? '/'
    return { entry: found.deck.entry, id: section.id, index: section.index, title: section.title, link }
  })

  connection.onRequest(PREVIEW_REQUEST, async ({ textDocument }: DocumentParams): Promise<Preview> => {
    const file = fileOf(textDocument.uri)
    const deck = file ? await decks.of(file) : undefined
    if (!deck) throw new Error(`${textDocument.uri} is not a source file of a Presmium deck`)
    return { entry: deck.entry, url: await previews.open(deck.entry) }
  })

  connection.onShutdown(() => previews.close())
  process.once('exit', () => void previews.close())

  documents.listen(connection)
  connection.listen()
}
