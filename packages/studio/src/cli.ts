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

function portOf(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(t.badPort(value))
  return n
}

export async function main(argv: string[], options: MainOptions = {}): Promise<number> {
  let values: { port?: string, host?: string, help?: boolean }
  let dir: string
  try {
    const parsed = parseArgs({ args: argv, allowPositionals: true, options: { port: { type: 'string' }, host: { type: 'string' }, help: { type: 'boolean', short: 'h' } } })
    values = parsed.values
    const [given = '.', ...extra] = parsed.positionals
    if (extra.length > 0) throw new Error(t.unexpectedArgument(extra[0]!))
    dir = resolve(given)
    if (!values.help && (!existsSync(dir) || !statSync(dir).isDirectory())) throw new Error(t.notDirectory(dir))
    portOf(values.port)
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

  let studio
  try {
    studio = await startStudio({ dir, port: portOf(values.port), onServiceOutput: text => process.stderr.write(text), ...values.host ? { listenAddress: values.host } : {}, ...options.presmium ? { presmium: options.presmium } : {} })
  } catch (error) {
    process.stderr.write(`presmium studio: ${error instanceof Error ? error.message : String(error)}\n`)
    return 2
  }
  process.stdout.write(`studio  ${studio.url}\n`)
  process.stderr.write(`${t.log(studio.log)}\n`)
  if (values.host && values.host !== '127.0.0.1' && values.host !== '::1') {
    process.stderr.write(`${t.openOnNetwork(values.host, new URL(studio.url).port, new URL(studio.workspaceServerUrl).port)}\n`)
  }

  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const
  let stop = () => {}
  const stopped = new Promise<void>(done => stop = done)
  for (const signal of signals) process.once(signal, stop)
  const ended = await Promise.race([stopped.then(() => undefined), studio.ended])
  for (const signal of signals) process.off(signal, stop)
  await studio.close()
  if (ended === undefined) return 0
  process.stderr.write(`${t.ended(ended, studio.log)}\n`)
  return 1
}
