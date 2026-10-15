import { existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import type { Finding, Severity } from '@presmium/kernel'
import { runCheck } from './check.ts'
import type { CheckOptions, CheckResult } from './check.ts'
import { DECK_ENTRY } from './deck.ts'
import { errorMessage } from './errors.ts'

const USAGE = `Usage: presmium check [deckDir] [--json] [--update-lock]

Runs the checks of every addon listed in the deck headmatter (deckDir defaults to .).

Options:
  --json          print the result as JSON
  --update-lock   re-resolve anchors and rewrite .presmium/anchors.lock.json
  -h, --help      show this help

Exit codes: 0 no errors, 1 error findings, 2 usage or internal error.`

interface Command extends CheckOptions {
  json: boolean
}

/** Runs `presmium <argv>` and returns the exit code. */
export async function main(argv: string[]): Promise<number> {
  let command: Command | 'help'
  try {
    command = parseCommand(argv)
  } catch (error) {
    process.stderr.write(`presmium: ${errorMessage(error)}\n\n${USAGE}\n`)
    return 2
  }
  if (command === 'help') {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  try {
    const result = await runCheck(command)
    process.stdout.write(command.json ? `${JSON.stringify(toJson(result), null, 2)}\n` : formatText(result, process.cwd()))
    return result.findings.some(f => f.severity === 'error') ? 1 : 0
  } catch (error) {
    process.stderr.write(`presmium: ${errorMessage(error)}\n`)
    return 2
  }
}

function parseCommand(argv: string[]): Command | 'help' {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      'json': { type: 'boolean', default: false },
      'update-lock': { type: 'boolean', default: false },
      'help': { type: 'boolean', short: 'h', default: false },
    },
  })
  if (values.help) return 'help'
  const [name, deckDir = '.', ...extra] = positionals
  if (name !== 'check') throw new Error(name ? `unknown command "${name}"` : 'missing command')
  if (extra.length > 0) throw new Error(`unexpected argument "${extra[0]}"`)
  const dir = resolve(deckDir)
  if (!existsSync(join(dir, DECK_ENTRY))) throw new Error(`${join(dir, DECK_ENTRY)} not found`)
  return { deckDir: dir, json: values.json, updateLock: values['update-lock'] }
}

function counts(findings: Finding[]): Record<Severity, number> {
  const result: Record<Severity, number> = { error: 0, warning: 0, info: 0 }
  for (const f of findings) result[f.severity]++
  return result
}

function toJson(result: CheckResult) {
  return { entry: result.entry, counts: counts(result.findings), findings: result.findings, lock: result.lock }
}

function formatText(result: CheckResult, cwd: string): string {
  const out: string[] = []
  for (const f of result.findings) {
    const where = f.source ? `${relative(cwd, f.source.file)}${f.source.line ? `:${f.source.line}` : ''}` : ''
    out.push(`${where}  ${f.severity}  ${f.message}  (${f.checkId})`)
    if (f.hint) out.push(`    hint: ${f.hint}`)
  }
  if (result.lock) {
    const state = result.lock.changed ? 'updated' : 'unchanged'
    out.push(`${relative(cwd, result.lock.file)} ${state} (${result.lock.anchors} anchors)`)
  }
  const n = counts(result.findings)
  out.push(result.findings.length === 0 ? 'no problems' : `${n.error} errors, ${n.warning} warnings, ${n.info} infos`)
  return `${out.join('\n')}\n`
}
