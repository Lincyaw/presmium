/**
 * Pass 7 (docs/ir.md section 4): runs code nodes whose `run.when` is
 * 'compile' or 'both' with the plugins' Node executors and the executors of
 * the declared environments, and records the result in `outputs`. Results are
 * cached in `.presmium/freeze/` under a hash of language, code, arguments,
 * executor id and environment, so unchanged code never runs twice, and a deck
 * with a committed cache builds without the runtime installed. A recording of
 * the same code made in another environment (e.g. another interpreter
 * version) is reused with a warning, so everyone who builds the deck gets the
 * same output; the headmatter `execute: { rerun: environment }` runs such
 * code again and replaces the recording. `presmium build` prunes the
 * recordings of code that is no longer in the deck, and the blobs no
 * recording refers to.
 *
 * The blocks of one `:session:` share an interpreter: a block's key chains
 * the key of the block before it, so changing one block runs the whole
 * session again, from its first block, in one go (P-101). Large MIME data of
 * rich outputs is stored apart, in `blobs/<sha256>` (P-102).
 *
 * Each run gets its `RunContext` (docs/architecture.md 4.6, 10.6): the
 * environment the code may see, cleaned of credentials, and the process
 * sandbox when a Node service provides one.
 */
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { CREDENTIAL_VARIABLE, environmentExecutor, errorMessage, irBlocks, isRecord } from '@presmium/kernel'
import type { CodeNode, Executor, Finding, IRBlock, IRDocument, RecordedRun, RunCache, RunContext, RunOutput, RunRequest, RunResult } from '@presmium/kernel'

/** Cache location relative to the deck directory. */
export const FREEZE_DIR = '.presmium/freeze'
/** Where MIME data longer than `BLOB_LENGTH` characters is stored, relative to the cache. */
const BLOBS = 'blobs'
const BLOB_LENGTH = 4096
/** How a recording refers to a blob: `{ "presmium/blob": "<sha256>" }`. */
const BLOB_REF = 'presmium/blob'

interface FreezeRecord {
  /** Hash of the request without executor and environment; finds a recording when no executor is installed. */
  input?: string
  /** Deck-relative entry file whose code the record answers; set on the records of the execution pass. */
  entry?: string
  lang?: string
  code?: string
  /** Fingerprint of the runtime that made the recording (`Executor.fingerprint`). */
  environment?: string
  run: RecordedRun
}

export class FreezeCache implements RunCache {
  readonly dir: string
  readonly entry: string
  /** Inputs of the requests made in this compilation. */
  readonly used = new Set<string>()
  /** File name -> record as stored (blobs referred to), read once when first needed (a lookup without an executor, or pruning). */
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

  /** Stores a run with the request it answers, in place of the recordings of the same request in other environments. */
  record(key: string, input: string, request: RunRequest, run: RecordedRun, environment: string): void {
    for (const [file, record] of this.#all()) {
      if (record.input !== input || file === `${key}.json`) continue
      rmSync(join(this.dir, file), { force: true })
      this.#records?.delete(file)
    }
    this.#write(key, { input, entry: this.entry, lang: request.lang, code: request.code, environment, run })
  }

  /** A recording of the same request by any executor, for builds without the runtime. */
  find(input: string): RecordedRun | undefined {
    return this.recording(input)?.run
  }

  /** The record of a recording of the same request by any executor, in any environment. */
  recording(input: string): { run: RecordedRun, environment?: string } | undefined {
    for (const record of this.#all().values()) {
      if (record.input === input) return { run: this.#restore(record.run), environment: record.environment }
    }
    return undefined
  }

  /**
   * Removes the records of this entry whose request was not made in this
   * compilation (the outputs of code that was edited or deleted), then the
   * blobs no record refers to. Records of other entries and those stored by
   * plugins through `set` are kept.
   */
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
        // No cache yet.
      }
      for (const file of files) {
        const record = this.#read(file)
        if (record) this.#records.set(file, record)
      }
    }
    return this.#records
  }

  /** A file of the cache. */
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

  /** The run with its long MIME data written to blobs and referred to. */
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

  /** The run with the blobs it refers to read back; data whose blob is missing is left out. */
  #restore(run: RecordedRun): RecordedRun {
    if (!run.outputs) return run
    return { ...run, outputs: run.outputs.map(output => mapData(output, (value) => {
      if (!isRecord(value) || typeof value[BLOB_REF] !== 'string') return value
      return this.#text(join(this.dir, BLOBS, value[BLOB_REF].replace(/[^0-9a-f]/g, '')))
    })) }
  }
}

/** An output with each MIME value replaced by `map`'s; an undefined value is left out. */
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

/** The execution options of the compiler (docs/architecture.md 4.6, 10.6), which the host gives; not a kernel contract. */
export interface ExecutionOptions {
  /** The rules of `RunContext.env`: `local` (default; build, check, dev) or `serve` (an allowlist and a temporary `HOME` per workspace). */
  env?: 'local' | 'serve'
}

export interface RunStats {
  /** Code nodes executed in this compilation. */
  executed: number
  /** Code nodes answered from the cache. */
  cached: number
  /** How the runs were isolated (`ProcessSandbox.kind`), when they ran in a process sandbox. */
  sandbox?: string
}

export interface ExecuteOptions extends ExecutionOptions {
  /** Run code again whose recording was made in another environment, instead of reusing it. */
  rerun?: boolean
  /** The context of every run. */
  context: RunContext
  /** Code whose environment does not run its language, which the compiler reported already (`checkLanguages`). */
  unsupported?: ReadonlySet<CodeNode>
}

const SERVE_ALLOWED = /^(?:PATH|LANG|LC_\w+|TZ|TMPDIR)$/

/**
 * `RunContext.env` (docs/architecture.md 4.6): under the `local` rules the
 * process's environment without the variables that start with `PRESMIUM_` or
 * name credentials (`CREDENTIAL_VARIABLE`: `_KEY`, `_TOKEN`, `_SECRET`,
 * `_PASSWORD`, `_APPID` at the end); under the
 * `serve` rules only `PATH`, `LANG`, `LC_*`, `TZ`, `TMPDIR` and a temporary
 * `HOME` of the workspace. Both add the variables the operator lists in
 * `settings.presmium.exec.passEnv`, with this process's values.
 */
export function runEnvironment(rules: 'local' | 'serve', passEnv: readonly string[], workspaceRoot: string, source: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue
    const kept = rules === 'serve' ? SERVE_ALLOWED.test(name) : !/^PRESMIUM_/i.test(name) && !CREDENTIAL_VARIABLE.test(name)
    if (kept) env[name] = value
  }
  if (rules === 'serve') {
    env.HOME = runHome(workspaceRoot, source)
    // Python's per-user site directory would load code from that HOME on every run.
    env.PYTHONNOUSERSITE = '1'
  }
  for (const name of passEnv) {
    const value = source[name]
    if (value !== undefined) env[name] = value
  }
  return env
}

/**
 * The `HOME` of runs under the `serve` rules: a directory of the workspace in
 * this user's state directory (not the shared temporary directory, where
 * another local user could create it first or put a link there), created
 * 0700 and refused unless it is this user's own directory.
 */
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

/** A code node to run at compile time, with its request and the hash of it (`input`). */
interface Item {
  node: CodeNode
  block: IRBlock
  request: RunRequest
  input: string
  key?: string
}

/** What runs as one: a block, or the blocks of a session in document order. */
interface Unit {
  session?: string
  items: Item[]
  executor?: Executor
  environment: string
}

type Report = (severity: Finding['severity'], message: string, block: IRBlock) => void

export async function executePass(doc: IRDocument, executors: Executor[], cache: FreezeCache, report: (finding: Finding) => void, options: ExecuteOptions): Promise<RunStats> {
  const stats: RunStats = { executed: 0, cached: 0, ...options.context.sandbox ? { sandbox: options.context.sandbox.kind } : {} }
  const say: Report = (severity, message, block) =>
    report({ checkId: 'presmium.execute', severity, message, source: { file: block.source.file, line: block.source.line } })
  const units = collect(doc, cache)

  // Answer what the cache can; the rest is pending.
  const pending: Unit[] = []
  for (const unit of units) {
    const run = unit.items[0]!.node.run!
    // A block that names no environment runs as it would without environments (docs/ir.md 2.7).
    unit.executor = run.executor
      ? executors.find(e => e.id === run.executor && e.supports(run.lang))
      : executors.find(e => !e.id.startsWith(environmentExecutor('')) && e.supports(run.lang))
    if (!unit.executor) {
      // An environment that does not run the block's language is an error of the compiler already (checkLanguages).
      for (const item of unit.items) fromRecording(item, cache, stats, say, run.executor, undefined, options.unsupported?.has(item.node))
      continue
    }
    try {
      unit.environment = await unit.executor.fingerprint?.(run.lang) ?? ''
    } catch (error) {
      for (const item of unit.items) fromRecording(item, cache, stats, say, run.executor, errorMessage(error))
      continue
    }
    let previous = unit.session
    for (const item of unit.items) {
      item.key = hash(unit.session ? { previous, input: item.input, executor: unit.executor.id, environment: unit.environment } : { input: item.input, executor: unit.executor.id, environment: unit.environment })
      previous = item.key
    }
    const cached = unit.items.map(item => cache.get(item.key!))
    if (cached.every(Boolean)) {
      unit.items.forEach((item, i) => item.node.outputs = [cached[i]!])
      stats.cached += unit.items.length
      continue
    }
    // Recorded for the same code, but by another runtime: the output everyone else gets.
    const others = options.rerun ? [] : unit.items.map(item => cache.recording(item.input))
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
  // The executors' sessions are this compilation's own (F-42): two documents compiled in one process (presmium
  // serve) that name the same session never share an interpreter. The deck's name stays in the requests, which
  // the cache and the hosts' approvals key on.
  const compile = `compile:${randomUUID()}`
  for (const unit of pending) {
    const executor = unit.executor!
    const session = unit.session && `${compile}:${unit.session}`
    const run = (request: RunRequest) => executor.run(session ? { ...request, session } : request, undefined, options.context)
    try {
      if (session) {
        // The session starts afresh; its blocks run in order: the executor queues them.
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
  // The end of the compilation ends the sessions it used.
  for (const [executor, session] of sessions) {
    await executor.endSession?.(session)?.catch(() => {})
  }
  return stats
}

/** The code nodes to run at compile time, as units: blocks alone, and sessions at their first block. */
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
      // A session of the deck: `<entry>:<name>` for the executors.
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
  // A timeout depends on the machine, not on the code; it is not recorded.
  if (!result.timedOut) cache.record(item.key!, item.input, item.request, recorded, unit.environment)
  if (!result.ok) say('warning', `block ${item.block.id} exited with ${result.timedOut ? 'a timeout' : result.exitCode === null ? `no exit code: ${result.stderr.trim().split('\n')[0]}` : `code ${result.exitCode}`}`, item.block)
}

/**
 * A block whose executor is missing or unavailable: the recording of the
 * same request by any executor, else nothing. A named environment's
 * executor is never replaced by another (docs/ir.md section 4), so a block
 * of an environment without recording is an error; `reported` when the
 * compiler said why already (the environment does not run its language).
 */
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
