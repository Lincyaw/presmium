import { spawn, spawnSync } from 'node:child_process'
import { once } from 'node:events'
import { chmodSync, createWriteStream, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { open } from 'yauzl'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'
import { expect, it } from 'vitest'
import { PREVIEW_REQUEST, SECTION_REQUEST } from '@lincyaw/language-server/protocol'
import type { Preview, SectionAt } from '@lincyaw/language-server/protocol'

const PKG = fileURLToPath(new URL('..', import.meta.url))
const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc')

function run(args: string[]): string {
  const { status, stdout, stderr } = spawnSync(process.execPath, args, { cwd: PKG, encoding: 'utf8' })
  if (status !== 0) throw new Error(`${stdout}${stderr}`)
  return stdout
}

it('type-checks and bundles into the main file of its manifest', () => {
  run([TSC, '-p', 'tsconfig.json'])
  run(['scripts/build.mjs'])
  const manifest = JSON.parse(readFileSync(`${PKG}/package.json`, 'utf8')) as { main: string, contributes: { commands: { command: string }[] } }
  const bundle = readFileSync(`${PKG}/${manifest.main}`, 'utf8')
  expect(bundle).toContain('require("vscode")')
  expect(bundle).toContain('presmium/section')
  const registered = [...readFileSync(`${PKG}/src/extension.ts`, 'utf8').matchAll(/registerCommand\('([\w.]+)'/g)].map(m => m[1])
  expect(registered.length).toBeGreaterThan(0)
  expect(manifest.contributes.commands.map(c => c.command)).toEqual(registered)
}, 120_000)

async function extract(vsix: string, into: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    open(vsix, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error)
      zip.on('error', reject)
      zip.on('end', resolve)
      zip.on('entry', (entry) => {
        const file = join(into, entry.fileName)
        if (entry.fileName.endsWith('/')) {
          mkdirSync(file, { recursive: true })
          zip.readEntry()
          return
        }
        mkdirSync(dirname(file), { recursive: true })
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return reject(error)
          void pipeline(stream, createWriteStream(file)).then(() => {
            const mode = (entry.externalFileAttributes >>> 16) & 0o777
            if (mode) chmodSync(file, mode)
            zip.readEntry()
          }, reject)
        })
      })
      zip.readEntry()
    })
  })
}

it('packages a VSIX whose language server renders a lecture outside the checkout', async () => {
  if (!process.env.PRESMIUM_VSIX_REUSE_BUILD) run(['scripts/package.mjs'])
  const { name, version } = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as { name: string, version: string }
  const target = `${process.platform}-${process.arch}`
  const dir = mkdtempSync(join(tmpdir(), 'presmium-installed-vsix-'))
  try {
    await extract(join(PKG, 'dist', `${name}-${version}-${target}.vsix`), dir)
    const extension = join(dir, 'extension')
    const installed = JSON.parse(readFileSync(join(extension, 'package.json'), 'utf8')) as { main: string, dependencies?: unknown }
    expect(installed.dependencies).toBeUndefined()
    expect(readFileSync(join(extension, installed.main), 'utf8')).toContain('presmium.openPreview')
    expect(readFileSync(join(dir, 'extension.vsixmanifest'), 'utf8')).toContain(`TargetPlatform="${target}"`)

    const cwd = join(dir, 'lecture')
    mkdirSync(cwd)
    const entry = join(cwd, 'lecture.md')
    const text = '---\ntitle: Installed VSIX\nrenderers:\n  web: {}\n---\n\n(one)=\n# Preview from the installed extension\n\nRendered outside the checkout.\n'
    writeFileSync(entry, text)
    const { NODE_ENV: _testing, ...environment } = process.env
    const child = spawn(process.execPath, [join(extension, 'runtime/bin/presmium-language-server.mjs'), '--stdio'], { cwd, env: { ...environment, NODE_PATH: '' }, stdio: ['pipe', 'pipe', 'inherit'] })
    const exited = once(child, 'exit')
    const connection = createMessageConnection(new StreamMessageReader(child.stdout), new StreamMessageWriter(child.stdin))
    const logs: string[] = []
    connection.onNotification('window/logMessage', ({ message }) => { logs.push(message) })
    connection.listen()
    let previewUrl: string | undefined
    try {
      await connection.sendRequest('initialize', { processId: process.pid, rootUri: null, capabilities: {}, workspaceFolders: null })
      await connection.sendNotification('initialized', {})
      const uri = pathToFileURL(entry).href
      const diagnostics = new Promise<unknown>(resolve => connection.onNotification('textDocument/publishDiagnostics', (params) => {
        if (params.uri === uri) resolve(params.diagnostics)
      }))
      await connection.sendNotification('textDocument/didOpen', { textDocument: { uri, languageId: 'markdown', version: 1, text } })
      expect(await diagnostics).toEqual([])
      const section = await connection.sendRequest<SectionAt>(SECTION_REQUEST, { textDocument: { uri }, position: { line: 8, character: 0 } })
      expect(section.id).toBe('one')
      const preview = await connection.sendRequest<Preview>(PREVIEW_REQUEST, { textDocument: { uri } }).catch(error => {
        throw new Error(`${error}\n${logs.join('\n')}`)
      })
      previewUrl = preview.url
      const response = await fetch(preview.url)
      expect(response.status).toBe(200)
      expect(await response.text()).toContain('<div id="app">')
      expect(readFileSync(join(cwd, '.presmium/preview/ir.json'), 'utf8')).toContain('Rendered outside the checkout.')
    } finally {
      await connection.sendRequest('shutdown')
      await connection.sendNotification('exit')
      await exited
      connection.dispose()
    }
    if (previewUrl) await expect.poll(async () => {
      try { await fetch(previewUrl); return true } catch { return false }
    }, { timeout: 5000 }).toBe(false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 300_000)
