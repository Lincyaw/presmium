import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { jsonResponse, problemResponse } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import { consentPath, consentProblem, DEFAULT_CONSENT_DIR, safeName } from '../domain/index.ts'
import { SpeechError } from './errors.ts'

export function consentDir(operatorDir: string, settings: Record<string, unknown>): string {
  const configured = typeof settings.consentDir === 'string' && settings.consentDir.trim() ? settings.consentDir.trim() : DEFAULT_CONSENT_DIR
  const dir = resolve(operatorDir, configured)
  if (!isInside(dir, resolve(operatorDir))) {
    throw new SpeechError(500, `settings.presmium.speech.consentDir (${configured}) leads out of the operator directory`)
  }
  return dir
}

function assertSafeNames(engine: string, voice: string): void {
  if (!safeName(engine) || !safeName(voice)) throw new SpeechError(400, `"${engine}/${voice}" is not an engine id and a voice id (letters, digits, ".", "_", "-")`)
}

export function checkConsent(operatorDir: string | undefined, settings: Record<string, unknown>, engine: string, voice: string): void {
  const what = `voice "${voice}" of engine "${engine}" is a cloned voice`
  if (settings.cloned !== true) {
    throw new SpeechError(403, `${what}, which the operator has not allowed: cloned voices need settings.presmium.speech.cloned: true in presmium.workspace.yaml and a consent record`)
  }
  if (!operatorDir) throw new SpeechError(403, `${what}, and this process has no operator directory to hold its consent record`)
  assertSafeNames(engine, voice)
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

export function writeConsent(operatorDir: string | undefined, settings: Record<string, unknown>, engine: string, voice: string, record: unknown): string {
  if (!operatorDir) throw new SpeechError(409, 'this process has no operator directory to hold consent records')
  assertSafeNames(engine, voice)
  const problem = consentProblem(record)
  if (problem) throw new SpeechError(400, problem)
  const file = join(consentDir(operatorDir, settings), consentPath(engine, voice))
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
  renameSync(temporary, file)
  return file
}

export async function consentRoute(request: Request, rest: string, register: (engine: string, voice: string, record: unknown) => string): Promise<Response> {
  if (request.method !== 'POST' && request.method !== 'PUT') return problemResponse(405, 'POST the consent record (JSON) to consent/<engine>/<voice>')
  const [engine, voice, ...more] = rest.split('/').filter(Boolean)
  if (!engine || !voice || more.length) return problemResponse(404, 'the route is consent/<engine>/<voice>')
  let record: unknown
  try {
    record = JSON.parse(await request.text())
  } catch {
    return problemResponse(400, 'the body is the consent record as JSON { speaker, scope, date, statementSha256 }')
  }
  try {
    register(engine, voice, record)
    return jsonResponse({ engine, voice, registered: consentPath(engine, voice) })
  } catch (error) {
    return problemResponse(error instanceof SpeechError ? error.status : 500, error instanceof Error ? error.message : String(error))
  }
}
