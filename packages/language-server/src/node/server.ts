import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DOCUMENT_ENTRY, fnv1a64 } from '@lincyaw/kernel'
import type { AnchorString } from '@lincyaw/kernel'
import { sectionLinks, webPages } from '@lincyaw/web/domain'
import { findNodeAtLocation, getNodeValue } from 'jsonc-parser'
import { TextDocument } from 'vscode-languageserver-textdocument'
import { createConnection, DidChangeWatchedFilesNotification, ProposedFeatures, TextDocuments, TextDocumentSyncKind } from 'vscode-languageserver/node'
import { entityReference, LS_MESSAGES, nodeAt, readDocument, sectionAtPath, PREVIEW_REQUEST, SECTION_REQUEST } from '../domain/index.ts'
import type { DocumentParams, PositionParams, Preview, SectionLocation } from '../domain/index.ts'
import { anchorDefinition, anchorHover } from './anchors.ts'
import type { AnchorRef } from './anchors.ts'
import { Decks } from './decks.ts'
import type { Deck } from './decks.ts'
import { DevServerLauncher } from './dev-server-launcher.ts'
import { diagnosticsByFile, documentDiagnostics, offsetRange } from './diagnostics.ts'

const COMPILE_DELAY = 50
const fileOf = (uri: string): string | undefined => uri.startsWith('file:') ? fileURLToPath(uri) : undefined
const canonical = (file: string | undefined): file is string => !!file && basename(file) === DOCUMENT_ENTRY
function fileText(file: string): string { try { return readFileSync(file, 'utf8') } catch { return '' } }

export function startServer(): void {
  const connection = createConnection(ProposedFeatures.all), documents = new TextDocuments(TextDocument)
  const devServers = new DevServerLauncher(line => connection.console.log(line))
  const published = new Map<Deck, Set<string>>(), timers = new Map<Deck, NodeJS.Timeout>()
  const textOf = (file: string) => documents.get(pathToFileURL(file).href)?.getText() ?? fileText(file)
  const publishDiagnostics = (deck: Deck) => {
    const text = textOf(deck.entry), disk = fileText(deck.entry), source = documentDiagnostics(text)
    const findings = !deck.findingsCurrent || deck.sourceFingerprint !== fnv1a64(disk) || source.some(d => d.severity === 1) || text.replace(/^\uFEFF/, '') !== disk.replace(/^\uFEFF/, '') ? [] : deck.findings
    const byFile = diagnosticsByFile(findings, deck.entry, textOf)
    byFile.set(deck.entry, [...source, ...byFile.get(deck.entry) ?? []])
    const files = new Set([...deck.compilation?.sourceFiles ?? [deck.entry], ...byFile.keys()])
    const uris = new Set([...files].map(file => pathToFileURL(file).href))
    for (const file of files) {
      const uri = pathToFileURL(file).href
      void connection.sendDiagnostics({ uri, version: documents.get(uri)?.version, diagnostics: byFile.get(file) ?? [] })
    }
    for (const uri of published.get(deck) ?? []) if (!uris.has(uri)) void connection.sendDiagnostics({ uri, diagnostics: [] })
    published.set(deck, uris)
  }
  const decks = new Decks(publishDiagnostics)
  const changed = (files: string[]) => {
    for (const deck of decks.all().filter(d => files.some(file => d.dependsOn(file)))) {
      deck.invalidate()
      clearTimeout(timers.get(deck))
      timers.set(deck, setTimeout(() => { timers.delete(deck); void deck.compile() }, COMPILE_DELAY))
    }
  }

  let watchFiles = false
  connection.onInitialize(({ capabilities }) => {
    watchFiles = capabilities.workspace?.didChangeWatchedFiles?.dynamicRegistration === true
    return { capabilities: {
      textDocumentSync: { openClose: true, change: TextDocumentSyncKind.Incremental, save: { includeText: false } },
      definitionProvider: true, hoverProvider: true,
    }, serverInfo: { name: 'presmium-language-server' } }
  })
  connection.onInitialized(() => {
    if (watchFiles) void connection.client.register(DidChangeWatchedFilesNotification.type, { watchers: [{ globPattern: '**/*' }] })
  })
  documents.onDidOpen(({ document }) => {
    const file = fileOf(document.uri)
    if (!canonical(file)) return
    void connection.sendDiagnostics({ uri: document.uri, version: document.version, diagnostics: documentDiagnostics(document.getText()) })
    void decks.findByFile(file)
  })
  documents.onDidChangeContent(({ document }) => {
    if (canonical(fileOf(document.uri))) void connection.sendDiagnostics({ uri: document.uri, version: document.version, diagnostics: documentDiagnostics(document.getText()) })
  })
  documents.onDidSave(({ document }) => { const file = fileOf(document.uri); if (canonical(file)) changed([file]) })
  documents.onDidClose(({ document }) => { const deck = decks.all().find(deck => pathToFileURL(deck.entry).href === document.uri); if (deck) publishDiagnostics(deck) })
  connection.onDidChangeWatchedFiles(({ changes }) => changed(changes.flatMap(change => fileOf(change.uri) ?? [])))

  const sourceAt = (uri: string, position: { line: number, character: number }) => {
    const file = fileOf(uri)
    if (!canonical(file)) return undefined
    const document = documents.get(uri) ?? TextDocument.create(uri, 'json', 0, fileText(file))
    const source = readDocument(document.getText())
    const found = source.tree && source.document ? nodeAt(source.tree, document.offsetAt(position)) : undefined
    return found && source.document ? { ...found, document, file, tree: source.tree!, content: source.document } : undefined
  }
  const anchorOf = async (uri: string, position: { line: number, character: number }) => {
    const found = sourceAt(uri, position)
    if (!found || found.path[0] !== 'blocks' || found.path.at(-1) !== 'anchor' || found.path.at(-2) !== 'origin' || found.node.type !== 'string') return undefined
    const block = found.content.blocks[String(found.path[1])]
    if (block?.type !== 'code') return undefined
    const deck = await decks.findByFile(found.file)
    if (!deck?.compilation) return undefined
    const origin = findNodeAtLocation(found.tree, found.path.slice(0, -1)), pin = origin && getNodeValue(origin)?.pin
    const ref: AnchorRef = { anchor: found.node.value as AnchorString, blockId: block.id, range: offsetRange(found.document, found.node.offset + 1, found.node.length - 2), ...typeof pin === 'string' ? { pin } : {} }
    return { compilation: deck.compilation, ref, t: LS_MESSAGES[found.content.metadata.lang === 'en' ? 'en' : 'zh-CN'] }
  }
  connection.onDefinition(async ({ textDocument, position }) => {
    const anchor = await anchorOf(textDocument.uri, position)
    if (anchor) return anchorDefinition(anchor.compilation, anchor.ref)
    const found = sourceAt(textDocument.uri, position)
    const target = found && entityReference(found.content, found.path, found.node.value)
    const node = target && found ? findNodeAtLocation(found.tree, target) : undefined
    return node && found ? [{ uri: textDocument.uri, range: offsetRange(found.document, node.offset, node.length) }] : null
  })
  connection.onHover(async ({ textDocument, position }) => {
    const found = await anchorOf(textDocument.uri, position)
    return found ? anchorHover(found.compilation, found.ref, found.t) : null
  })
  connection.onRequest(SECTION_REQUEST, async ({ textDocument, position }: PositionParams): Promise<SectionLocation | null> => {
    const found = sourceAt(textDocument.uri, position)
    const id = found && sectionAtPath(found.content, found.path)
    const section = id && found?.content.sections[id]
    if (!found || !id || !section) return null
    const deck = await decks.findByFile(found.file)
    const link = deck?.compilation ? sectionLinks(webPages(deck.compilation.doc))[id] ?? '/' : '/'
    return { entry: found.file, id, index: found.content.sectionOrder.indexOf(id) + 1, title: section.title, link }
  })
  connection.onRequest(PREVIEW_REQUEST, async ({ textDocument }: DocumentParams): Promise<Preview> => {
    const file = fileOf(textDocument.uri), deck = canonical(file) ? await decks.findByFile(file) : undefined
    if (!deck) throw new Error(`Preview requires a canonical ${DOCUMENT_ENTRY} document.`)
    return { entry: deck.entry, url: await devServers.urlOf(deck.entry) }
  })

  connection.onShutdown(() => { for (const timer of timers.values()) clearTimeout(timer); timers.clear(); return devServers.close() })
  process.once('exit', () => void devServers.close())
  documents.listen(connection)
  connection.listen()
}
