// Drives the real language server process over stdio with the LSP protocol, as an editor does.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  createProtocolConnection,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DidSaveTextDocumentNotification,
  ExitNotification,
  InitializedNotification,
  InitializeRequest,
  PublishDiagnosticsNotification,
  ShutdownRequest,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-languageserver/node'
import type { Diagnostic, ProtocolConnection } from 'vscode-languageserver/node'

const BIN = fileURLToPath(new URL('../bin/presmium-language-server.mjs', import.meta.url))

export interface Client {
  connection: ProtocolConnection
  open(uri: string, text: string): void
  /** Replaces the whole text of an open document, without saving it. */
  change(uri: string, text: string, version: number): void
  /** Tells the server the document was saved, as an editor does once it wrote the file. */
  save(uri: string): void
  /** The diagnostics last published for a document; waits for the first publication. */
  diagnostics(uri: string): Promise<Diagnostic[]>
  close(): Promise<void>
}

export async function startServer(): Promise<Client> {
  const child = spawn(process.execPath, [BIN, '--stdio'], { stdio: ['pipe', 'pipe', 'inherit'] })
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  const connection = createProtocolConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin))
  const published = new Map<string, Diagnostic[]>()
  const waiting = new Map<string, ((diagnostics: Diagnostic[]) => void)[]>()
  connection.onNotification(PublishDiagnosticsNotification.type, ({ uri, diagnostics }) => {
    published.set(uri, diagnostics)
    for (const resolve of waiting.get(uri) ?? []) resolve(diagnostics)
    waiting.delete(uri)
  })
  connection.listen()
  await connection.sendRequest(InitializeRequest.type, { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: null })
  await connection.sendNotification(InitializedNotification.type, {})

  return {
    connection,
    open(uri, text) {
      void connection.sendNotification(DidOpenTextDocumentNotification.type, { textDocument: { uri, languageId: 'markdown', version: 1, text } })
    },
    change(uri, text, version) {
      void connection.sendNotification(DidChangeTextDocumentNotification.type, { textDocument: { uri, version }, contentChanges: [{ text }] })
    },
    save(uri) {
      void connection.sendNotification(DidSaveTextDocumentNotification.type, { textDocument: { uri } })
    },
    diagnostics(uri) {
      const known = published.get(uri)
      if (known) return Promise.resolve(known)
      return new Promise(resolve => waiting.set(uri, [...waiting.get(uri) ?? [], resolve]))
    },
    async close() {
      await connection.sendRequest(ShutdownRequest.type)
      await connection.sendNotification(ExitNotification.type)
      await exited
      connection.dispose()
    },
  }
}
