import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { errorMessage, escapeHtml } from '@lincyaw/kernel'
import { previewUrl } from '@lincyaw/language-server/domain'
import { PREVIEW_REQUEST, SECTION_REQUEST } from '@lincyaw/language-server/protocol'
import type { Preview, SectionAt } from '@lincyaw/language-server/protocol'
import * as vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

const SERVER_PACKAGE = '@lincyaw/language-server'
const SERVER_BIN = 'bin/presmium-language-server.mjs'
const FOLLOW_DELAY = 150

let client: LanguageClient | undefined

function serverModule(context: vscode.ExtensionContext): string {
  const configured = vscode.workspace.getConfiguration('presmium').get<string>('server.path')
  if (configured) return configured
  const bases = [...(vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath), context.extensionPath]
  for (const base of bases) {
    try {
      return join(dirname(createRequire(join(base, 'package.json')).resolve(`${SERVER_PACKAGE}/package.json`)), SERVER_BIN)
    } catch {
    }
  }
  const bundled = join(context.extensionPath, 'runtime', SERVER_BIN)
  if (existsSync(bundled)) return bundled
  throw new Error(`${SERVER_PACKAGE} is not installed; add it to the workspace or set presmium.server.path`)
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  let server: string
  try {
    server = serverModule(context)
  } catch (error) {
    void vscode.window.showErrorMessage(`Presmium: ${errorMessage(error)}`)
    return
  }
  const runtime = vscode.workspace.getConfiguration('presmium').get<string>('server.runtime') || 'node'
  client = new LanguageClient('presmium', 'Presmium', { module: server, runtime, transport: TransportKind.ipc }, {
    documentSelector: [{ scheme: 'file', language: 'markdown' }],
  })
  context.subscriptions.push(vscode.commands.registerCommand('presmium.openPreview', () => openPreview(client!)))
  await client.start()
}

export async function deactivate(): Promise<void> {
  await client?.stop()
}

function sectionAt(client: LanguageClient, editor: vscode.TextEditor): Promise<SectionAt | null> {
  const position = client.code2ProtocolConverter.asPosition(editor.selection.active)
  return client.sendRequest<SectionAt | null>(SECTION_REQUEST, { textDocument: { uri: editor.document.uri.toString() }, position })
}

async function openPreview(client: LanguageClient): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) return
  let preview: Preview
  try {
    preview = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Starting presmium dev' }, () =>
      client.sendRequest<Preview>(PREVIEW_REQUEST, { textDocument: { uri: editor.document.uri.toString() } }))
  } catch (error) {
    void vscode.window.showErrorMessage(`Presmium preview: ${errorMessage(error)}`)
    return
  }
  const base = (await vscode.env.asExternalUri(vscode.Uri.parse(preview.url))).toString(true).replace(/\/?$/, '/')
  let shown: SectionAt | undefined
  const urlOf = (section: SectionAt | null | undefined): string => previewUrl(base, section, shown)

  const first = await sectionAt(client, editor)
  const panel = vscode.window.createWebviewPanel('presmium.preview', `Preview ${vscode.workspace.asRelativePath(preview.entry)}`, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true })
  panel.webview.html = previewHtml(urlOf(first), new URL(base).origin)
  shown = first ?? undefined

  let timer: NodeJS.Timeout | undefined
  const follow = vscode.window.onDidChangeTextEditorSelection(({ textEditor }) => {
    if (textEditor.document.languageId !== 'markdown') return
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const section = await sectionAt(client, textEditor).catch(() => null)
      if (!section || section.entry !== preview.entry || section.id === shown?.id) return
      const url = urlOf(section)
      shown = section
      void panel.webview.postMessage({ type: 'presmium:show', url })
    }, FOLLOW_DELAY)
  })
  panel.onDidDispose(() => {
    clearTimeout(timer)
    follow.dispose()
  })
}

function previewHtml(url: string, origin: string): string {
  const nonce = randomBytes(16).toString('base64')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${escapeHtml(origin)}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; } iframe { display: block; border: 0; width: 100%; height: 100%; }</style>
</head>
<body>
<iframe id="preview" title="Presmium preview" src="${escapeHtml(url)}"></iframe>
<script nonce="${nonce}">
const frame = document.getElementById('preview')
window.addEventListener('message', (event) => {
  const message = event.data
  if (message && message.type === 'presmium:show' && typeof message.url === 'string') frame.src = message.url
})
</script>
</body>
</html>`
}
