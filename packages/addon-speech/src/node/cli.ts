/**
 * `presmium-speech` (docs/architecture.md section 7): `fake`, the
 * deterministic fake engine; `consent`, the operator's registration of a
 * cloned voice's consent record in the operator directory (in SHARED mode
 * run in the gateway container with its `--operator-dir`). The standalone
 * speech gateway of earlier designs is `presmium gateway` now.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { operatorDir, workspaceSettings } from '@presmium/compiler'
import { errorMessage } from '@presmium/kernel'
import { SPEECH_ID } from '../domain/index.ts'
import { writeConsent } from './consent.ts'
import { startFakeEngine } from './fake.ts'

const USAGE = `Usage: presmium-speech <command> [options]

Commands:
  fake      the deterministic fake engine, an HTTP service of the OpenAI audio API shape;
            define it with PRESMIUM_SPEECH_FAKE_URL=<the address it prints> and
            PRESMIUM_SPEECH_FAKE_PROVIDER=<a name>
            --port <n>     port (default: a free port)
            --host <addr>  address (default: 127.0.0.1)
  consent <engine> <voice> <record>
            registers the consent record (JSON: speaker, scope, date, statementSha256) of a
            cloned voice as <consentDir>/<engine>/<voice>.json of the operator directory
            (consentDir from settings.presmium.speech of presmium.workspace.yaml, default consent)
            --operator-dir <dir>  the operator directory (default: the workspace's in the
                                  user's state directory, or PRESMIUM_OPERATOR_DIR)

  -h, --help   show this help`

/** The workspace root of a directory: its git repository's, else the directory. */
function workspaceRoot(dir: string): string {
  try {
    return resolve(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim())
  } catch {
    return resolve(dir)
  }
}

async function fake(args: string[]): Promise<number> {
  const { values } = parseArgs({ args, options: { port: { type: 'string' }, host: { type: 'string' } } })
  const port = values.port === undefined ? 0 : Number(values.port)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`--port takes a port number, not "${values.port}"`)
  const engine = await startFakeEngine({ port, host: values.host })
  process.stdout.write(`fake  ${engine.url}\n`)
  await new Promise<void>((done) => {
    process.once('SIGINT', done)
    process.once('SIGTERM', done)
  })
  await engine.close()
  return 0
}

function consent(args: string[]): number {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { 'operator-dir': { type: 'string' } } })
  const [engine, voice, file, ...more] = positionals
  if (!engine || !voice || !file || more.length) throw new Error('consent takes <engine> <voice> <record>')
  const record: unknown = JSON.parse(readFileSync(resolve(file), 'utf8'))
  const root = workspaceRoot(process.cwd())
  const { settings, problem } = workspaceSettings(root)
  if (problem) throw new Error(problem)
  const dir = operatorDir(root, values['operator-dir'] ?? process.env.PRESMIUM_OPERATOR_DIR)
  const written = writeConsent(dir, settings[SPEECH_ID] ?? {}, engine, voice, record)
  process.stdout.write(`consent  ${written}\n`)
  return 0
}

/** Runs `presmium-speech <argv>`; returns the exit code. */
export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv
  try {
    if (command === 'fake') return await fake(args)
    if (command === 'consent') return consent(args)
    if (command === '-h' || command === '--help' || command === undefined) {
      process.stdout.write(`${USAGE}\n`)
      return command === undefined ? 2 : 0
    }
    throw new Error(`unknown command "${command}"`)
  } catch (error) {
    process.stderr.write(`presmium-speech: ${errorMessage(error)}\n\n${USAGE}\n`)
    return 2
  }
}
