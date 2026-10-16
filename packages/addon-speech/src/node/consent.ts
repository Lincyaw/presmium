/**
 * The gate of cloned voices (N-08, docs/architecture.md section 11): the
 * operator allows them (`settings.presmium.speech.cloned: true`) and each
 * has its speaker's consent record at `<consentDir>/<engine>/<voice>.json`
 * of the operator directory (`consentDir` from the settings, default
 * `consent`). LOCAL mode's operator directory is outside every workspace,
 * the gateway's is mounted in the gateway only; records in a deck are never
 * read. The same check runs in `presmium` (LOCAL) and in the gateway.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { consentPath, consentProblem, DEFAULT_CONSENT_DIR, safeName } from '../domain/index.ts'
import { SpeechError } from './errors.ts'

/** The consent directory of an operator directory. */
export function consentDir(operatorDir: string, settings: Record<string, unknown>): string {
  const configured = typeof settings.consentDir === 'string' && settings.consentDir.trim() ? settings.consentDir.trim() : DEFAULT_CONSENT_DIR
  const dir = resolve(operatorDir, configured)
  const rel = relative(resolve(operatorDir), dir)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new SpeechError(500, `settings.presmium.speech.consentDir (${configured}) leads out of the operator directory`)
  }
  return dir
}

function names(engine: string, voice: string): void {
  if (!safeName(engine) || !safeName(voice)) throw new SpeechError(400, `"${engine}/${voice}" is not an engine id and a voice id (letters, digits, ".", "_", "-")`)
}

/** Refuses a cloned voice the operator has not allowed, or whose consent record is missing or invalid. */
export function checkConsent(operatorDir: string | undefined, settings: Record<string, unknown>, engine: string, voice: string): void {
  const what = `voice "${voice}" of engine "${engine}" is a cloned voice`
  if (settings.cloned !== true) {
    throw new SpeechError(403, `${what}, which the operator has not allowed: cloned voices need settings.presmium.speech.cloned: true in presmium.workspace.yaml and a consent record`)
  }
  if (!operatorDir) throw new SpeechError(403, `${what}, and this process has no operator directory to hold its consent record`)
  names(engine, voice)
  const file = join(consentDir(operatorDir, settings), consentPath(engine, voice))
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    throw new SpeechError(403, `${what} without a consent record: ${file} is missing (records in the deck are not read); the owner registers it through the route consent/${engine}/${voice}, or the operator runs presmium-speech consent ${engine} ${voice} <record>`)
  }
  let record: unknown
  try {
    record = JSON.parse(text)
  } catch {
    record = undefined
  }
  const problem = consentProblem(record)
  if (problem) throw new SpeechError(403, `${what} whose consent record ${file} is not valid: ${problem}`)
}

/** Writes a consent record into the operator directory; returns its file. */
export function writeConsent(operatorDir: string | undefined, settings: Record<string, unknown>, engine: string, voice: string, record: unknown): string {
  if (!operatorDir) throw new SpeechError(409, 'this process has no operator directory to hold consent records')
  names(engine, voice)
  const problem = consentProblem(record)
  if (problem) throw new SpeechError(400, problem)
  const file = join(consentDir(operatorDir, settings), consentPath(engine, voice))
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, file)
  return file
}

/** The route `consent/<engine>/<voice>`: the request's body (JSON) is the record. */
export async function consentRoute(request: Request, rest: string, register: (engine: string, voice: string, record: unknown) => string): Promise<Response> {
  const answer = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } })
  if (request.method !== 'POST' && request.method !== 'PUT') return answer({ error: 'POST the consent record (JSON) to consent/<engine>/<voice>' }, 405)
  const [engine, voice, ...more] = rest.split('/').filter(Boolean)
  if (!engine || !voice || more.length) return answer({ error: 'the route is consent/<engine>/<voice>' }, 404)
  let record: unknown
  try {
    record = JSON.parse(await request.text())
  } catch {
    return answer({ error: 'the body is the consent record as JSON { speaker, scope, date, statementSha256 }' }, 400)
  }
  try {
    register(engine, voice, record)
    return answer({ engine, voice, registered: consentPath(engine, voice) })
  } catch (error) {
    return answer({ error: error instanceof Error ? error.message : String(error) }, error instanceof SpeechError ? error.status : 500)
  }
}
