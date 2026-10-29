import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { operatorDir, workspaceSettings } from '@lincyaw/compiler'
import { errorMessage } from '@lincyaw/kernel'
import { SPEECH_ID } from '../domain/index.ts'
import { writeConsent } from './consent.ts'
import { speechCore } from './core.ts'
import { startFakeEngine } from './fake-engine.ts'

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
  clone <engine> <voice> <sample>
            trains the cloned voice <voice> (Volcengine: a slot of the account, S_…, or a new
            name for a pay-as-you-go voice) from a recording of its speaker (10–30 s, one voice,
            WAV, MP3, Ogg or M4A), after registering their consent; training is paid for at the
            provider. Needs settings.presmium.speech.cloned: true. Waits until it is trained
            --speaker <name>      who speaks
            --scope <text>        what the voice may be used for
            --statement <file>    the speaker's recording of the consent statement
            --lang <tag>          the sample's language (default zh-CN)
            --text <text>         what the sample says, when known
            --status              only show the state of an earlier training
            --operator-dir <dir>  as for consent

  -h, --help   show this help`

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
  const engine = await startFakeEngine({ port, listenAddress: values.host })
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

const MIME: Record<string, string> = { wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac' }
const mimeOf = (file: string) => MIME[file.split('.').at(-1)?.toLowerCase() ?? ''] ?? 'application/octet-stream'

async function clone(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    speaker: { type: 'string' }, scope: { type: 'string' }, statement: { type: 'string' }, lang: { type: 'string' }, text: { type: 'string' },
    status: { type: 'boolean' }, 'operator-dir': { type: 'string' },
  } })
  const [engine, voice, sample, ...more] = positionals
  if (!engine || !voice || (!values.status && !sample) || more.length) throw new Error('clone takes <engine> <voice> <sample> (or <engine> <voice> --status)')
  const root = workspaceRoot(process.cwd())
  const { settings, problem } = workspaceSettings(root)
  if (problem) throw new Error(problem)
  const say = (...parts: unknown[]) => process.stderr.write(`${parts.map(String).join(' ')}\n`)
  const core = speechCore({
    names: () => Object.keys(process.env),
    secret: name => process.env[name],
    settings: settings[SPEECH_ID] ?? {},
    operatorDir: operatorDir(root, values['operator-dir'] ?? process.env.PRESMIUM_OPERATOR_DIR),
    log: { debug: () => {}, info: say, warn: say, error: say },
  })
  let status = values.status
    ? await core.cloneStatus(engine, voice)
    : await (async () => {
      if (!values.speaker || !values.scope || !values.statement) throw new Error('clone needs --speaker, --scope and --statement: the speaker\'s consent comes first')
      return core.cloneVoice({
        engine, voice, sample: readFileSync(resolve(sample!)), sampleMime: mimeOf(sample!), lang: values.lang ?? 'zh-CN', ...values.text ? { text: values.text } : {},
        consent: { speaker: values.speaker, scope: values.scope, statement: readFileSync(resolve(values.statement)), statementMime: mimeOf(values.statement) },
      })
    })()
  for (let polls = 0; !values.status && status.state === 'training' && polls < 200; polls++) {
    process.stdout.write(`training  ${voice}\n`)
    await new Promise(done => setTimeout(done, 3000))
    status = await core.cloneStatus(engine, voice)
  }
  process.stdout.write(`${status.state}  ${voice}${status.trainingsLeft === undefined ? '' : `  (${status.trainingsLeft} trainings left)`}\n`)
  return status.state === 'failed' ? 1 : 0
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv
  try {
    if (command === 'fake') return await fake(args)
    if (command === 'consent') return consent(args)
    if (command === 'clone') return await clone(args)
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
