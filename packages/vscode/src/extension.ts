import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { errorMessage } from '@lincyaw/kernel'
import { previewUrl } from '@lincyaw/language-server/domain'
import { PREVIEW_REQUEST, SECTION_REQUEST } from '@lincyaw/language-server/protocol'
import type { Preview, SectionLocation } from '@lincyaw/language-server/protocol'
import * as vscode from 'vscode'
import { LanguageClient, TransportKind } from 'vscode-languageclient/node'
import { StudioLauncher } from './studio.ts'
import { runtimeBin } from './runtime.ts'
import { installProjectSkills } from './skills.ts'

const SERVER_PACKAGE = '@lincyaw/language-server'
const SERVER_BIN = 'bin/presmium-language-server.mjs'
const BROWSER_COMMAND = 'workbench.action.browser.open'
const isDocument = (document: vscode.TextDocument) => document.uri.scheme === 'file' && document.languageId === 'json' && basename(document.uri.fsPath) === 'lecture.json'

let client: LanguageClient | undefined
let studios: StudioLauncher | undefined
let lifecycle = 0
let operations: AbortController | undefined

function serverModule(context: vscode.ExtensionContext): string {
  const configured = vscode.workspace.getConfiguration('presmium').get<string>('server.path')
  if (configured) return configured
  const server = runtimeBin(SERVER_PACKAGE, 'presmium-language-server', (vscode.workspace.workspaceFolders ?? []).map(folder => folder.uri.fsPath), context.extensionPath)
  if (server) return server
  // VSIX files from earlier releases deployed the language server as the runtime root.
  const bundled = join(context.extensionPath, 'runtime', SERVER_BIN)
  if (existsSync(bundled)) return bundled
  throw new Error('language-server-not-installed')
}

/** Use the editor's real browser, with normal cookies, WebSockets and downloads. */
async function openBrowser(url: string, beside: boolean, current: () => boolean): Promise<vscode.Tab | undefined> {
  const commands = await vscode.commands.getCommands(true)
  if (!current()) return
  if (commands.includes(BROWSER_COMMAND)) {
    const external = await vscode.env.asExternalUri(vscode.Uri.parse(url))
    if (!current()) return
    await vscode.commands.executeCommand(BROWSER_COMMAND, {
      url: external.toString(true), openToSide: beside,
      reuseUrlFilter: `${new URL(external.toString(true)).origin}/**`,
    })
    return vscode.window.tabGroups.activeTabGroup.activeTab
  } else if (current() && !await vscode.env.openExternal(vscode.Uri.parse(url))) {
    throw new Error('browser-open-failed')
  }
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const lifetime = ++lifecycle
  const ownedOperations = new AbortController(); operations = ownedOperations
  let previewRequest = 0, studioRequest = 0
  const output = vscode.window.createOutputChannel('Presmium', { log: true })
  const runtime = () => vscode.workspace.getConfiguration('presmium').get<string>('server.runtime') || 'node'
  const run = (message: string, action: (resource?: vscode.Uri) => Promise<void>) => async (resource?: vscode.Uri) => {
    try { await action(resource) } catch (error) {
      if (lifetime !== lifecycle) return
      // Details stay in the diagnostic channel; authors see a translated next step.
      output.appendLine(errorMessage(error))
      const show = vscode.l10n.t('Show Output')
      if (await vscode.window.showErrorMessage(message, show) === show) output.show(true)
    }
  }
  const studio = () => studios ??= new StudioLauncher({ runtime: runtime(), extensionPath: context.extensionPath, log: line => { if (lifetime === lifecycle) output.appendLine(line) } })
  const studioTabs = new Map<string, vscode.Tab>()
  const activeDocument = async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor || !isDocument(editor.document)) {
      void vscode.window.showInformationMessage(vscode.l10n.t('Open lecture.json to preview or present this document.'))
      return
    }
    if (editor.document.isDirty && !await editor.document.save()) return
    return editor
  }
  let language: Promise<LanguageClient> | undefined
  const languageClient = (): Promise<LanguageClient> => language ??= (async () => {
    if (!client) {
      const candidate = new LanguageClient('presmium', 'Presmium', { module: serverModule(context), runtime: runtime(), transport: TransportKind.ipc }, {
        documentSelector: [{ scheme: 'file', language: 'json', pattern: '**/lecture.json' }], outputChannel: output,
      })
      client = candidate
      try { await candidate.start() } catch (error) { if (client === candidate) client = undefined; throw error }
    }
    return client
  })().catch(error => { language = undefined; throw error })
  const preview = async (present: boolean) => {
    const request = ++previewRequest
    const current = () => lifetime === lifecycle && request === previewRequest
    const editor = await activeDocument()
    if (!editor || !current()) return
    const version = editor.document.version
    const language = await languageClient()
    if (!current()) return
    const location = await language.sendRequest<SectionLocation | null>(SECTION_REQUEST, {
      textDocument: { uri: editor.document.uri.toString() }, position: language.code2ProtocolConverter.asPosition(editor.selection.active),
    })
    if (!current()) return
    const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: vscode.l10n.t('Starting the preview…') }, () =>
      language.sendRequest<Preview>(PREVIEW_REQUEST, { textDocument: { uri: editor.document.uri.toString() } }))
    if (!current() || editor.document.isDirty || editor.document.version !== version) return
    const url = new URL(present ? result.url : previewUrl(result.url, location))
    if (present) {
      url.searchParams.set('form', 'slides')
      if (location) url.searchParams.set('section', location.id)
    }
    await openBrowser(url.href, !present, current)
  }
  context.subscriptions.push(output,
    vscode.window.tabGroups.onDidChangeTabs(() => {
      for (const [address, tab] of studioTabs) if (!vscode.window.tabGroups.all.some(group => group.tabs.includes(tab))) studioTabs.delete(address)
    }),
    vscode.commands.registerCommand('presmium.openPreview', run(vscode.l10n.t('Couldn’t open the preview. Check the Presmium output and try again.'), () => preview(false))),
    vscode.commands.registerCommand('presmium.present', run(vscode.l10n.t('Couldn’t open the presentation. Check the Presmium output and try again.'), () => preview(true))),
    vscode.commands.registerCommand('presmium.openStudio', run(vscode.l10n.t('Couldn’t open the visual editor. Check the Presmium output and try again.'), async resource => {
      const request = ++studioRequest
      const current = () => lifetime === lifecycle && request === studioRequest
      const editor = vscode.window.activeTextEditor
      const selected = resource instanceof vscode.Uri && resource.scheme === 'file' && basename(resource.fsPath) === 'lecture.json'
        ? await vscode.workspace.openTextDocument(resource) : editor?.document
      const document = selected && isDocument(selected) ? selected : undefined
      if (document?.isDirty && !await document.save()) return
      if (!current()) return
      const version = document?.version
      const directory = await studioDirectory(document)
      if (!directory || !current()) return
      const address = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Starting the visual editor…') }, () => studio().urlOf(directory))
      if (!current() || document && (document.isDirty || document.version !== version)) return
      const url = new URL(address)
      url.hash = `presmium-open=${randomUUID()}`
      const previous = studioTabs.get(address)
      // An existing authenticated tab needs only a fragment change, preserving its mounted editors and drafts.
      if (previous && vscode.window.tabGroups.all.some(group => group.tabs.includes(previous))) url.searchParams.delete('token')
      if (document) {
        let id: string | undefined
        try { const value: unknown = JSON.parse(document.getText()); if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') id = value.id } catch {}
        if (id) {
          const target = new URLSearchParams({ document: relative(directory, dirname(document.uri.fsPath)).split(sep).join('/'), id, request: randomUUID() })
          if (client?.isRunning() && editor?.document === document) {
            const location = await client.sendRequest<SectionLocation | null>(SECTION_REQUEST, { textDocument: { uri: document.uri.toString() }, position: client.code2ProtocolConverter.asPosition(editor.selection.active) }).catch(() => null)
            if (location) target.set('section', location.id)
          }
          url.hash = `presmium?${target}`
        }
      }
      if (!current() || document && (document.isDirty || document.version !== version)) return
      const tab = await openBrowser(url.href, false, current)
      if (tab && current()) studioTabs.set(address, tab)
    })),
    vscode.commands.registerCommand('presmium.installSkills', run(vscode.l10n.t('Couldn’t install the project skills. Check the Presmium output and try again.'), async resource => {
      const selected = resource instanceof vscode.Uri && resource.scheme === 'file' && basename(resource.fsPath) === 'lecture.json'
        ? await vscode.workspace.openTextDocument(resource) : vscode.window.activeTextEditor?.document
      const document = selected && isDocument(selected) ? selected : undefined
      const directory = resource instanceof vscode.Uri && resource.scheme === 'file' && ((await vscode.workspace.fs.stat(resource)).type & vscode.FileType.Directory) !== 0
        ? resource.fsPath : await studioDirectory(document, vscode.l10n.t('Install Project Skills'))
      if (!directory || lifetime !== lifecycle) return
      const result = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: vscode.l10n.t('Installing the project skills…') }, () =>
        installProjectSkills({ directory, extensionPath: context.extensionPath, runtime: runtime(), signal: ownedOperations.signal }))
      if (lifetime === lifecycle) void vscode.window.showInformationMessage(vscode.l10n.t('Installed {0} project skills; kept {1} existing skills.', result.installed.length, result.skipped.length))
    })),
    vscode.commands.registerCommand('presmium.stopStudio', run(vscode.l10n.t('Couldn’t stop the visual editor. Check the Presmium output and try again.'), async () => {
      studioRequest++
      const running = studios; studios = undefined
      studioTabs.clear()
      await running?.close()
    })),
  )
  // Authoring remains available even when a separately configured language server fails.
  void languageClient().catch(error => { if (lifetime === lifecycle) output.appendLine(errorMessage(error)) })
}

/** The nearest explicit Presmium workspace inside the VS Code folder, else that folder. */
async function studioDirectory(document?: vscode.TextDocument, openLabel = vscode.l10n.t('Open Visual Editor')): Promise<string | undefined> {
  const folder = document ? vscode.workspace.getWorkspaceFolder(document.uri) : undefined
  if (document) {
    const start = dirname(document.uri.fsPath), boundary = folder?.uri.fsPath
    for (let current = start; ; current = dirname(current)) {
      if (existsSync(join(current, 'presmium.workspace.yaml'))) return current
      if (current === boundary) return boundary
      if (existsSync(join(current, '.git'))) return boundary ?? current
      if (dirname(current) === current) break
    }
    return boundary ?? start
  }
  const folders = vscode.workspace.workspaceFolders?.filter(item => item.uri.scheme === 'file') ?? []
  if (folders.length === 1) return folders[0]!.uri.fsPath
  if (folders.length > 1) return (await vscode.window.showWorkspaceFolderPick())?.uri.fsPath
  const selected = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel })
  return selected?.[0]?.fsPath
}

export async function deactivate(): Promise<void> {
  lifecycle++
  operations?.abort(); operations = undefined
  const runningClient = client, runningStudios = studios
  client = undefined; studios = undefined
  await Promise.allSettled([runningClient?.stop(), runningStudios?.close()])
}
