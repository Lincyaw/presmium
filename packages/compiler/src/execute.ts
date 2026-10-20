import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CREDENTIAL_VARIABLE, environmentExecutor, errorMessage, irBlocks, isRecord } from '@lincyaw/kernel'
import type { CodeNode, Executor, Finding, IRBlock, IRDocument, RecordedRun, RunCache, RunContext, RunOutput, RunRequest, RunResult } from '@lincyaw/kernel'

export const FREEZE_DIR = '.presmium/freeze'
const BLOBS = 'blobs'
const BLOB_LENGTH = 4096
const BLOB_REF = 'presmium/blob'

interface FreezeRecord {
  input?: string
  entry?: string
  lang?: string
  code?: string
  environment?: string
  revision?: string
  run: RecordedRun
}

export class FreezeCache implements RunCache {
  readonly dir: string
  readonly entry: string
  readonly used = new Set<string>()
  #records?: Map<string, FreezeRecord>

  constructor(dir: string, entry: string) {
    this.dir = dir
    this.entry = entry
  }

  get(key: string): RecordedRun | undefined {
    const record = this.#read(`${key}.json`)
    return record && this.#restore(record.run)
  }

  set(key: string, run: RecordedRun): void {
    this.#write(key, { run })
  }

  record(key: string, input: string, request: RunRequest, run: RecordedRun, environment: string, revision = ''): void {
    for (const [file, record] of this.#all()) {
      if (record.input !== input || file === `${key}.json`) continue
      rmSync(join(this.dir, file), { force: true })
      this.#records?.delete(file)
    }
    this.#write(key, { input, entry: this.entry, lang: request.lang, code: request.code, environment, ...revision ? { revision } : {}, run })
  }

  find(input: string): RecordedRun | undefined {
    return this.recording(input)?.run
  }

  recording(input: string): { run: RecordedRun, environment?: string, revision: string } | undefined {
    for (const record of this.#all().values()) {
      if (record.input === input) return { run: this.#restore(record.run), environment: record.environment, revision: record.revision ?? '' }
    }
    return undefined
  }

  prune(): number {
    let removed = 0
    for (const [file, record] of this.#all()) {
      if (record.entry !== this.entry || !record.input || this.used.has(record.input)) continue
      rmSync(join(this.dir, file), { force: true })
      this.#records?.delete(file)
      removed++
    }
    const referred = new Set<string>()
    for (const record of this.#all().values()) blobRefs(record.run, referred)
    let blobs: string[] = []
    try {
      blobs = readdirSync(join(this.dir, BLOBS))
    } catch {}
    for (const blob of blobs.filter(name => !referred.has(name))) rmSync(join(this.dir, BLOBS, blob), { force: true })
    return removed
  }

  #all(): Map<string, FreezeRecord> {
    if (!this.#records) {
      this.#records = new Map()
      let files: string[] = []
      try {
        files = readdirSync(this.dir).filter(f => f.endsWith('.json')).sort()
      } catch {
      }
      for (const file of files) {
        const record = this.#read(file)
        if (record) this.#records.set(file, record)
      }
    }
    return this.#records
  }

  #text(file: string): string | undefined {
    try {
      return readFileSync(file, 'utf8')
    } catch {
      return undefined
    }
  }

  #read(file: string): FreezeRecord | undefined {
    const text = this.#text(join(this.dir, file))
    if (text === undefined) return undefined
    try {
      const data: unknown = JSON.parse(text)
      return isRecord(data) && isRecord(data.run) ? data as unknown as FreezeRecord : undefined
    } catch {
      return undefined
    }
  }

  #write(key: string, record: FreezeRecord): void {
    mkdirSync(this.dir, { recursive: true })
    const stored = { ...record, run: this.#store(record.run) }
    writeFileSync(join(this.dir, `${key}.json`), `${JSON.stringify(stored, null, 2)}\n`)
    this.#records?.set(`${key}.json`, stored)
  }

  #store(run: RecordedRun): RecordedRun {
    if (!run.outputs) return run
    return { ...run, outputs: run.outputs.map(output => mapData(output, (value) => {
      const text = Array.isArray(value) && value.every(v => typeof v === 'string') ? value.join('') : value
      if (typeof text !== 'string' || text.length <= BLOB_LENGTH) return value
      const name = createHash('sha256').update(text).digest('hex')
      const file = join(this.dir, BLOBS, name)
      if (!existsSync(file)) {
        mkdirSync(join(this.dir, BLOBS), { recursive: true })
        writeFileSync(file, text)
      }
      return { [BLOB_REF]: name }
    })) }
  }

  #restore(run: RecordedRun): RecordedRun {
    if (!run.outputs) return run
    return { ...run, outputs: run.outputs.map(output => mapData(output, (value) => {
      if (!isRecord(value) || typeof value[BLOB_REF] !== 'string') return value
      return this.#text(join(this.dir, BLOBS, value[BLOB_REF].replace(/[^0-9a-f]/g, '')))
    })) }
  }
}

function mapData(output: RunOutput, map: (value: unknown) => unknown): RunOutput {
  if (output.output_type !== 'display_data' && output.output_type !== 'execute_result') return output
  const data: Record<string, unknown> = {}
  for (const [mime, value] of Object.entries(output.data)) {
    const mapped = map(value)
    if (mapped !== undefined) data[mime] = mapped
  }
  return { ...output, data }
}

function blobRefs(run: RecordedRun, into: Set<string>): void {
  for (const output of run.outputs ?? []) {
    mapData(output, (value) => {
      if (isRecord(value) && typeof value[BLOB_REF] === 'string') into.add(value[BLOB_REF])
      return value
    })
  }
}

export interface ExecutionOptions {
  env?: 'local' | 'serve'
}

export interface RunStats {
  executed: number
  cached: number
  sandbox?: string
}

export interface ExecuteOptions extends ExecutionOptions {
  rerun?: boolean
  context: RunContext
  unsupported?: ReadonlySet<CodeNode>
}

const SERVE_ALLOWED = /^(?:PATH|LANG|LC_\w+|TZ|TMPDIR)$/

export function runEnvironment(rules: 'local' | 'serve', passEnv: readonly string[], workspaceRoot: string, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue
    const kept = rules === 'serve' ? SERVE_ALLOWED.test(name) : !/^PRESMIUM_/i.test(name) && !CREDENTIAL_VARIABLE.test(name)
    if (kept) env[name] = value
  }
  if (rules === 'serve') {
    env.HOME = runHome(workspaceRoot, source)
    env.PYTHONNOUSERSITE = '1'
  }
  for (const name of passEnv) {
    const value = source[name]
    if (value !== undefined) env[name] = value
  }
  return env
}

function runHome(workspaceRoot: string, source: NodeJS.ProcessEnv): string {
  const state = source.XDG_STATE_HOME || join(homedir(), '.local', 'state')
  const home = join(state, 'presmium', 'run-home', createHash('sha256').update(workspaceRoot).digest('hex').slice(0, 16))
  mkdirSync(home, { recursive: true, mode: 0o700 })
  const stat = lstatSync(home)
  const uid = process.getuid?.()
  if (!stat.isDirectory() || (uid !== undefined && stat.uid !== uid) || (stat.mode & 0o077) !== 0) {
    throw new Error(`the run HOME ${home} is not a private directory of this user`)
  }
  return home
}

interface Item {
  node: CodeNode
  block: IRBlock
  request: RunRequest
  input: string
  key?: string
}

interface Unit {
  session?: string
  items: Item[]
  executor?: Executor
  environment: string
  revision?: string
}

type Report = (severity: Finding['severity'], message: string, block: IRBlock) => void

export async function executePass(doc: IRDocument, executors: Executor[], cache: FreezeCache, report: (finding: Finding) => void, options: ExecuteOptions): Promise<RunStats> {
  const stats: RunStats = { executed: 0, cached: 0, ...options.context.sandbox ? { sandbox: options.context.sandbox.kind } : {} }
  const say: Report = (severity, message, block) =>
    report({ checkId: 'presmium.execute', severity, message, source: { file: block.source.file, line: block.source.line } })
  const units = collect(doc, cache)

  const pending: Unit[] = []
  for (const unit of units) {
    const run = unit.items[0]!.node.run!
    unit.executor = run.executor
      ? executors.find(e => e.id === run.executor && e.supports(run.lang))
      : executors.find(e => !e.id.startsWith(environmentExecutor('')) && e.supports(run.lang))
    if (!unit.executor) {
      for (const item of unit.items) fromRecording(item, cache, stats, say, run.executor, undefined, options.unsupported?.has(item.node))
      continue
    }
    try {
      unit.environment = await unit.executor.fingerprint?.(run.lang) ?? ''
      unit.revision = await unit.executor.revision?.(run.lang) ?? ''
    } catch (error) {
      for (const item of unit.items) fromRecording(item, cache, stats, say, run.executor, errorMessage(error))
      continue
    }
    let previous = unit.session
    for (const item of unit.items) {
      const made = { executor: unit.executor.id, environment: unit.environment, ...unit.revision ? { revision: unit.revision } : {} }
      item.key = hash(unit.session ? { previous, input: item.input, ...made } : { input: item.input, ...made })
      previous = item.key
    }
    const cached = unit.items.map(item => cache.get(item.key!))
    if (cached.every(Boolean)) {
      unit.items.forEach((item, i) => item.node.outputs = [cached[i]!])
      stats.cached += unit.items.length
      continue
    }
    const others = options.rerun ? [] : unit.items.map(item => cache.recording(item.input)).map(other => (other?.revision === unit.revision ? other : undefined))
    if (others.length > 0 && others.every(Boolean)) {
      unit.items.forEach((item, i) => {
        const other = others[i]!
        item.node.outputs = [other.run]
        const made = other.environment === undefined ? 'another environment' : `"${other.environment || 'no fingerprint'}"`
        say('warning', `block ${item.block.id}: its recorded output was made with ${made}, this build has "${unit.environment || 'no fingerprint'}"; the recording is reused (\`execute: { rerun: environment }\` in the headmatter runs it again)`, item.block)
      })
      stats.cached += unit.items.length
      continue
    }
    pending.push(unit)
  }

  const sessions: [Executor, string][] = []
  const compile = `compile:${randomUUID()}`
  for (const unit of pending) {
    const executor = unit.executor!
    const session = unit.session && `${compile}:${unit.session}`
    const run = (request: RunRequest) => executor.run(session ? { ...request, session } : request, undefined, options.context)
    try {
      if (session) {
        await executor.endSession?.(session)
        sessions.push([executor, session])
        const results = await Promise.all(unit.items.map(item => run(item.request)))
        unit.items.forEach((item, i) => record(item, results[i]!, unit, cache, stats, say))
      } else {
        const item = unit.items[0]!
        record(item, await run(item.request), unit, cache, stats, say)
      }
    } catch (error) {
      for (const item of unit.items) fromRecording(item, cache, stats, say, executor.id, errorMessage(error))
    }
  }
  for (const [executor, session] of sessions) {
    await executor.endSession?.(session)?.catch(() => {})
  }
  return stats
}

function collect(doc: IRDocument, cache: FreezeCache): Unit[] {
  const units: Unit[] = []
  const sessions = new Map<string, Unit>()
  for (const section of doc.sections) {
    for (const block of irBlocks(section.blocks)) {
      const node = block.node
      if (node.type !== 'code' || !node.run || node.run.when === 'live') continue
      const run = node.run
      const request: RunRequest = { lang: run.lang, code: node.value }
      if (run.args) request.args = run.args
      if (run.stdin !== undefined) request.stdin = run.stdin
      if (run.timeoutMs !== undefined) request.timeoutMs = run.timeoutMs
      const fields = { lang: request.lang, code: request.code, args: request.args, stdin: request.stdin, executor: run.executor }
      if (!run.session) {
        const input = hash(fields)
        cache.used.add(input)
        units.push({ items: [{ node, block, request, input }], environment: '' })
        continue
      }
      const session = `${cache.entry}:${run.session}`
      request.session = session
      let unit = sessions.get(session)
      if (!unit) {
        unit = { session, items: [], environment: '' }
        sessions.set(session, unit)
        units.push(unit)
      }
      const input = hash({ previous: unit.items.at(-1)?.input ?? session, ...fields })
      cache.used.add(input)
      unit.items.push({ node, block, request, input })
    }
  }
  return units
}

function record(item: Item, result: RunResult, unit: Unit, cache: FreezeCache, stats: RunStats, say: Report): void {
  const recorded: RecordedRun = { ...result, cacheKey: item.key! }
  item.node.outputs = [recorded]
  stats.executed++
  if (!result.timedOut) cache.record(item.key!, item.input, item.request, recorded, unit.environment, unit.revision)
  if (!result.ok) say('warning', `block ${item.block.id} exited with ${result.timedOut ? 'a timeout' : result.exitCode === null ? `no exit code: ${result.stderr.trim().split('\n')[0]}` : `code ${result.exitCode}`}`, item.block)
}

function fromRecording(item: Item, cache: FreezeCache, stats: RunStats, say: Report, executor: string | undefined, failure?: string, reported = false): void {
  const recorded = cache.find(item.input)
  const which = executor ?? item.request.lang
  if (recorded) {
    item.node.outputs = [recorded]
    stats.cached++
    if (failure) say('warning', `executor ${which} is unavailable (${failure}); block ${item.block.id} shows its recorded output`, item.block)
    return
  }
  if (reported) return
  if (failure) return say('error', `executor ${which} failed on block ${item.block.id}: ${failure}`, item.block)
  const environment = executor?.startsWith(environmentExecutor(''))
  say(environment ? 'error' : 'warning', `no executor for ${which} and no recorded output in ${FREEZE_DIR}; block ${item.block.id} has no output`, item.block)
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
