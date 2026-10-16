/**
 * Pass 7 (docs/ir.md section 4): runs code nodes whose `run.when` is
 * 'compile' or 'both' with the plugins' Node executors and records the result
 * in `outputs`. Results are cached in `.presmium/freeze/` under a hash of
 * language, code, arguments, executor id and environment, so unchanged code
 * never runs twice, and a deck with a committed cache builds without the
 * runtime installed. A recording of the same code made in another
 * environment (e.g. another interpreter version) is reused with a warning, so
 * everyone who builds the deck gets the same output; the headmatter
 * `execute: { rerun: environment }` runs such code again and replaces the
 * recording. `presmium build` prunes the recordings of code that is no longer
 * in the deck.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { errorMessage, irBlocks, isRecord } from '@presmium/kernel'
import type { CodeNode, Executor, Finding, IRBlock, IRDocument, RecordedRun, RunCache, RunRequest } from '@presmium/kernel'

/** Cache location relative to the deck directory. */
export const FREEZE_DIR = '.presmium/freeze'

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
  /** File name -> record, read once when first needed (a lookup without an executor, or pruning). */
  #records?: Map<string, FreezeRecord>

  constructor(dir: string, entry: string) {
    this.dir = dir
    this.entry = entry
  }

  get(key: string): RecordedRun | undefined {
    return this.#read(`${key}.json`)?.run
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
      if (record.input === input) return record
    }
    return undefined
  }

  /**
   * Removes the records of this entry whose request was not made in this
   * compilation: the outputs of code that was edited or deleted. Records of
   * other entries and those stored by plugins through `set` are kept.
   */
  prune(): number {
    let removed = 0
    for (const [file, record] of this.#all()) {
      if (record.entry !== this.entry || !record.input || this.used.has(record.input)) continue
      rmSync(join(this.dir, file), { force: true })
      this.#records?.delete(file)
      removed++
    }
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

  #read(file: string): FreezeRecord | undefined {
    try {
      const data: unknown = JSON.parse(readFileSync(join(this.dir, file), 'utf8'))
      return isRecord(data) && isRecord(data.run) ? data as unknown as FreezeRecord : undefined
    } catch {
      return undefined
    }
  }

  #write(key: string, record: FreezeRecord): void {
    mkdirSync(this.dir, { recursive: true })
    writeFileSync(join(this.dir, `${key}.json`), `${JSON.stringify(record, null, 2)}\n`)
    this.#records?.set(`${key}.json`, record)
  }
}

export interface RunStats {
  /** Code nodes executed in this compilation. */
  executed: number
  /** Code nodes answered from the cache. */
  cached: number
}

export interface ExecuteOptions {
  /** Run code again whose recording was made in another environment, instead of reusing it. */
  rerun?: boolean
}

export async function executePass(doc: IRDocument, executors: Executor[], cache: FreezeCache, report: (finding: Finding) => void, options: ExecuteOptions = {}): Promise<RunStats> {
  const stats: RunStats = { executed: 0, cached: 0 }
  for (const section of doc.sections) {
    for (const block of irBlocks(section.blocks)) {
      if (block.node.type !== 'code' || !block.node.run || block.node.run.when === 'live') continue
      await runCode(block.node, block, executors, cache, stats, options, (severity, message) =>
        report({ checkId: 'presmium.execute', severity, message, source: { file: block.source.file, line: block.source.line } }))
    }
  }
  return stats
}

async function runCode(
  node: CodeNode,
  block: IRBlock,
  executors: Executor[],
  cache: FreezeCache,
  stats: RunStats,
  options: ExecuteOptions,
  report: (severity: Finding['severity'], message: string) => void,
): Promise<void> {
  const run = node.run!
  const request: RunRequest = { lang: run.lang, code: node.value }
  if (run.args) request.args = run.args
  if (run.stdin !== undefined) request.stdin = run.stdin
  if (run.timeoutMs !== undefined) request.timeoutMs = run.timeoutMs
  const input = hash({ lang: request.lang, code: request.code, args: request.args, stdin: request.stdin, executor: run.executor })
  cache.used.add(input)
  const executor = run.executor ? executors.find(e => e.id === run.executor) : executors.find(e => e.supports(run.lang))

  if (!executor) {
    const recorded = cache.find(input)
    if (recorded) {
      node.outputs = [recorded]
      stats.cached++
    } else {
      report('warning', `no executor for ${run.executor ?? run.lang} and no recorded output in ${FREEZE_DIR}; block ${block.id} has no output`)
    }
    return
  }

  try {
    const environment = await executor.fingerprint?.(run.lang) ?? ''
    const cacheKey = hash({ input, executor: executor.id, environment })
    const cached = cache.get(cacheKey)
    if (cached) {
      node.outputs = [cached]
      stats.cached++
      return
    }
    // Recorded for the same code, but by another runtime: the output everyone else gets.
    const other = options.rerun ? undefined : cache.recording(input)
    if (other) {
      node.outputs = [other.run]
      stats.cached++
      const made = other.environment === undefined ? 'another environment' : `"${other.environment || 'no fingerprint'}"`
      report('warning', `block ${block.id}: its recorded output was made with ${made}, this build has "${environment || 'no fingerprint'}"; the recording is reused (\`execute: { rerun: environment }\` in the headmatter runs it again)`)
      return
    }
    const result = await executor.run(request)
    const recorded: RecordedRun = { ...result, cacheKey }
    node.outputs = [recorded]
    stats.executed++
    // A timeout depends on the machine, not on the code; it is not recorded.
    if (!result.timedOut) cache.record(cacheKey, input, request, recorded, environment)
    if (!result.ok) report('warning', `block ${block.id} exited with ${result.timedOut ? 'a timeout' : `code ${result.exitCode}`}`)
  } catch (error) {
    report('error', `executor ${executor.id} failed on block ${block.id}: ${errorMessage(error)}`)
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
