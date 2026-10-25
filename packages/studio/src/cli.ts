import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { modelEnv } from './model-env.ts'
import { startStudio } from './studio.ts'

const USAGE = `Usage: presmium studio [dir] [options]

The workbench of Presmium (experimental): DeepSeek Harness with Presmium's bundle, and the workspace
service of the directory (the workspace root, or a deck's directory; default: .). It prints the one
address to open in the browser. The model is chosen in the workbench's model settings, or given by the
environment: DEEPSEEK_API_KEY, or PRESMIUM_MODEL_URL, PRESMIUM_MODEL_KEY and PRESMIUM_MODEL_PROVIDER for
a Messages-compatible service. DeepSeek Harness's home (sessions, model settings and credentials, the
log presmium-studio.log) is $XDG_STATE_HOME/presmium/studio.

Options:
  --port <n>     the workbench's port (default: 4320, or a free one when that is in use)
  --host <addr>  listen on this address of the machine on the local network instead of 127.0.0.1, with
                 no login: whoever reaches the port works as you
  -h, --help     show this help`

export interface MainOptions {
  presmium?: string
}

function portOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`--port takes a port number, not "${value}"`)
  return n
}

export async function main(argv: string[], options: MainOptions = {}): Promise<number> {
  let values: { port?: string, host?: string, help?: boolean }
  let dir: string
  try {
    const parsed = parseArgs({ args: argv, allowPositionals: true, options: { port: { type: 'string' }, host: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
    values = parsed.values
    const [given = '.', ...extra] = parsed.positionals
    if (extra.length > 0) throw new Error(`unexpected argument "${extra[0]}"`)
    dir = resolve(given)
    if (!values.help && (!existsSync(dir) || !statSync(dir).isDirectory())) throw new Error(`${dir} is not a directory`)
    portOf(values.port)
  } catch (error) {
    process.stderr.write(`presmium studio: ${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n`)
    return 2
  }
  if (values.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }

  const model = modelEnv(process.env)
  if (model.warning) process.stderr.write(`presmium studio: ${model.warning}\n`)

  let studio
  try {
    studio = await startStudio({ dir, port: portOf(values.port), onServiceOutput: text => process.stderr.write(text), ...values.host ? { listenAddress: values.host } : {}, ...options.presmium ? { presmium: options.presmium } : {} })
  } catch (error) {
    process.stderr.write(`presmium studio: ${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
  process.stdout.write(`studio  ${studio.url}\n`)
  process.stderr.write(`presmium studio: log ${studio.log}\n`)
  if (values.host && values.host !== '127.0.0.1' && values.host !== '::1') {
    process.stderr.write(`presmium studio: listening on ${values.host}, on the local network, with no login: anyone who reaches port ${new URL(studio.url).port} (and the previews' port ${new URL(studio.workspaceServerUrl).port}) with the address above works in this workspace as you (edits, runs code, uses your model). Use it on a network you trust; without --host it listens on this machine only.\n`)
  }

  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const
  let stop = () => {}
  const stopped = new Promise<void>(done => stop = done)
  for (const signal of signals) process.once(signal, stop)
  const ended = await Promise.race([stopped.then(() => undefined), studio.ended])
  for (const signal of signals) process.off(signal, stop)
  await studio.close()
  if (ended === undefined) return 0
  process.stderr.write(`presmium studio: ${ended}; the log is ${studio.log}\n`)
  return 1
}
