import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, dirname, join } from 'node:path'
import { errorMessage, escapeHtml } from '@lincyaw/kernel'
import { previewUrl } from '@lincyaw/language-server/domain'
import { PREVIEW_REQUEST, SECTION_REQUEST } from '@lincyaw/language-server/protocol'
import type { Preview, SectionLocation } from '@lincyaw/language-server/protocol'
import * as vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'

const SERVER_PACKAGE = '@lincyaw/language-server'
const SERVER_BIN = 'bin/presmium-language-server.mjs'
const SYNC_DELAY = 150
const isDocument = (document: vscode.TextDocument) => document.uri.scheme === 'file' && document.languageId === 'json' && basename(document.uri.fsPath) === 'lecture.json'

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
  throw new Error(vscode.l10n.t('{0} is not installed. Add it to the workspace, or set presmium.server.path.', SERVER_PACKAGE))
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  let server: string
  try {
    server = serverModule(context)
  } catch (error) {
    void vscode.window.showErrorMessage(vscode.l10n.t('Couldn’t start Presmium: {0}', errorMessage(error)))
    return
  }
  const runtime = vscode.workspace.getConfiguration('presmium').get<string>('server.runtime') || 'node'
  client = new LanguageClient('presmium', 'Presmium', { module: server, runtime, transport: TransportKind.ipc }, {
    documentSelector: [{ scheme: 'file', language: 'json', pattern: '**/lecture.json' }],
  })
  context.subscriptions.push(vscode.commands.registerCommand('presmium.openPreview', () => openPreview(client!)))
  await client.start()
}

export async function deactivate(): Promise<void> {
  await client?.stop()
}

function requestSectionAtCursor(client: LanguageClient, editor: vscode.TextEditor): Promise<SectionLocation | null> {
  const position = client.code2ProtocolConverter.asPosition(editor.selection.active)
  return client.sendRequest<SectionLocation | null>(SECTION_REQUEST, { textDocument: { uri: editor.document.uri.toString() }, position })
}

async function openPreview(client: LanguageClient): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor || !isDocument(editor.document)) return
  if (editor.document.isDirty && !await editor.document.save()) return
  let preview: Preview
  try {
    preview = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t('Starting the preview…') }, () =>
      client.sendRequest<Preview>(PREVIEW_REQUEST, { textDocument: { uri: editor.document.uri.toString() } }))
  } catch (error) {
    void vscode.window.showErrorMessage(vscode.l10n.t('Couldn’t open the preview: {0}', errorMessage(error)))
    return
  }
  const base = (await vscode.env.asExternalUri(vscode.Uri.parse(preview.url))).toString(true).replace(/\/?$/, '/')
  let shown: SectionLocation | undefined
  const urlOf = (section: SectionLocation | null | undefined): string => previewUrl(base, section, shown)

  const first = await requestSectionAtCursor(client, editor)
  const panel = vscode.window.createWebviewPanel('presmium.preview', vscode.l10n.t('Preview {0}', vscode.workspace.asRelativePath(preview.entry)), { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, retainContextWhenHidden: true })
  panel.webview.html = previewHtml(urlOf(first), new URL(base).origin)
  shown = first ?? undefined

  let timer: NodeJS.Timeout | undefined
  let cursorRequest = 0
  const syncPreviewToCursor = vscode.window.onDidChangeTextEditorSelection(({ textEditor }) => {
    if (!isDocument(textEditor.document)) return
    const request = ++cursorRequest
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const section = await requestSectionAtCursor(client, textEditor).catch(() => null)
      if (request !== cursorRequest || !section || section.entry !== preview.entry || section.id === shown?.id) return
      const url = urlOf(section)
      shown = section
      void panel.webview.postMessage({ type: 'presmium:show', url })
    }, SYNC_DELAY)
  })
  panel.onDidDispose(() => {
    cursorRequest++
    clearTimeout(timer)
    syncPreviewToCursor.dispose()
  })
}

function previewHtml(url: string, origin: string): string {
  const nonce = randomBytes(16).toString('base64')
  return `<!DOCTYPE html>
<html lang="${escapeHtml(vscode.env.language)}">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src ${escapeHtml(origin)}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
<style>html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; } iframe { display: block; border: 0; width: 100%; height: 100%; }</style>
</head>
<body>
<iframe id="preview" title="${escapeHtml(vscode.l10n.t('Presmium Preview'))}" src="${escapeHtml(url)}"></iframe>
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
