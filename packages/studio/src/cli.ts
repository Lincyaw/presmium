import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { STUDIO_MESSAGES, systemLocale } from './messages.ts'
import { modelEnv } from './model-env.ts'
import { startStudio } from './studio.ts'

const t = STUDIO_MESSAGES[systemLocale()]

export interface MainOptions {
  presmium?: string
}

function urlOf(option: string, value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  try {
    const url = new URL(value)
    if (/^https?:$/.test(url.protocol) && !url.username && !url.password && !url.search && !url.hash) return url.href
  } catch {}
  throw new Error(t.badUrl(option, value))
}

function portOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(t.badPort(value))
  return n
}

/** Desktop owns the input pipe; closing it must stop Studio even when the app cannot run cleanup. */
function watchParentPipe(onEnd: () => void): () => void {
  if (process.env.PRESMIUM_STUDIO_PARENT_PIPE !== '1') return () => {}
  delete process.env.PRESMIUM_STUDIO_PARENT_PIPE
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    onEnd()
  }
  process.stdin.on('end', end).on('close', end).on('error', end)
  process.stdin.resume()
  return () => {
    process.stdin.off('end', end).off('close', end).off('error', end)
    process.stdin.pause()
  }
}

export async function main(argv: string[], options: MainOptions = {}): Promise<number> {
  let values: { port?: string, host?: string, 'public-url'?: string, 'preview-url'?: string, 'preview-port'?: string, verbose?: boolean, help?: boolean }
  let dir: string
  try {
    const parsed = parseArgs({ args: argv, allowPositionals: true, options: { port: { type: 'string' }, host: { type: 'string' }, 'public-url': { type: 'string' }, 'preview-url': { type: 'string' }, 'preview-port': { type: 'string' }, verbose: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } } })
    values = parsed.values
    const [given = '.', ...extra] = parsed.positionals
    if (extra.length > 0) throw new Error(t.unexpectedArgument(extra[0]!))
    dir = resolve(given)
    if (!values.help && (!existsSync(dir) || !statSync(dir).isDirectory())) throw new Error(t.notDirectory(dir))
    portOf(values.port)
    urlOf('--public-url', values['public-url'])
    urlOf('--preview-url', values['preview-url'])
    portOf(values['preview-port'])
  } catch (error) {
    process.stderr.write(`presmium studio: ${error instanceof Error ? error.message : String(error)}\n\n${t.usage}\n`)
    return 2
  }
  if (values.help) {
    process.stdout.write(`${t.usage}\n`)
    return 0
  }

  const model = modelEnv(process.env)
  if (model.warning) process.stderr.write(`presmium studio: ${model.warning}\n`)

  // During startup, exiting closes the watchdog pipes; once ready, use Studio's graceful close path.
  let parentStop: () => void = () => process.exit(0)
  const unwatchParent = watchParentPipe(() => parentStop())
  let studio
  try {
    studio = await startStudio({ dir, port: portOf(values.port), ...values.verbose ? { onServiceOutput: (text: string) => void process.stderr.write(text) } : {}, ...values.host ? { listenAddress: values.host } : {}, ...values['public-url'] ? { publicUrl: urlOf('--public-url', values['public-url']) } : {}, ...values['preview-url'] ? { previewUrl: urlOf('--preview-url', values['preview-url']) } : {}, ...values['preview-port'] ? { previewPort: portOf(values['preview-port']) } : {}, ...options.presmium ? { presmium: options.presmium } : {} })
  } catch (error) {
    unwatchParent()
    process.stderr.write(`presmium studio: ${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
  // One address to open; the MCP address, its token and the log file only with --verbose (the log has them too).
  process.stdout.write(`studio  ${studio.url}\n`)
  for (const url of studio.networkUrls) process.stdout.write(`network  ${url}\n`)
  if (values.verbose) {
    process.stdout.write(`mcp  ${studio.mcp.url}\n`)
    process.stderr.write(`${t.mcpToken(studio.mcp.tokenFile)}\n`)
    if (studio.mcp.movedFrom) process.stderr.write(`${t.previewPortMoved(studio.mcp.movedFrom, studio.mcp.url)}\n`)
    process.stderr.write(`${t.log(studio.log)}\n`)
  } else process.stderr.write(`${t.open}\n`)
  if (values.host && values.host !== '127.0.0.1' && values.host !== '::1' && !values['public-url']) {
    process.stderr.write(`${studio.networkUrls.length
      ? t.openOnAllNetworks(new URL(studio.url).port, new URL(studio.workspaceServerUrl).port)
      : t.openOnNetwork(values.host, new URL(studio.url).port, new URL(studio.workspaceServerUrl).port)}\n`)
  }

  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const
  let stop = () => {}
  const stopped = new Promise<void>(done => stop = done)
  parentStop = stop
  for (const signal of signals) process.once(signal, stop)
  const ended = await Promise.race([stopped.then(() => undefined), studio.ended])
  unwatchParent()
  for (const signal of signals) process.off(signal, stop)
  await studio.close()
  if (ended === undefined) return 0
  process.stderr.write(`${t.ended(ended, studio.log)}\n`)
  return 1
}
