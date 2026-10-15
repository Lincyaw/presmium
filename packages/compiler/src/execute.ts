/**
 * Pass 7 (docs/ir.md section 4): runs code nodes whose `run.when` is
 * 'compile' or 'both' with the plugins' Node executors and records the result
 * in `outputs`. Results are cached in `.presmium/freeze/` under a hash of
 * language, code, arguments, executor id and environment, so unchanged code
 * never runs twice, and a deck with a committed cache builds without the
 * runtime installed.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { CodeNode, Executor, Finding, IRBlock, IRDocument, RecordedRun, RunCache, RunRequest } from '@presmium/kernel'
import { errorMessage, isRecord } from './workspace.ts'

/** Cache location relative to the deck directory. */
export const FREEZE_DIR = '.presmium/freeze'

interface FreezeRecord {
  /** Hash of the request without executor and environment; finds a recording when no executor is installed. */
  input?: string
  lang?: string
  code?: string
  run: RecordedRun
}

export class FreezeCache implements RunCache {
  readonly dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  get(key: string): RecordedRun | undefined {
    return this.#read(`${key}.json`)?.run
  }

  set(key: string, run: RecordedRun): void {
    this.#write(key, { run })
  }

  /** Stores a run with the request it answers. */
  record(key: string, input: string, request: RunRequest, run: RecordedRun): void {
    this.#write(key, { input, lang: request.lang, code: request.code, run })
  }

  /** A recording of the same request by any executor, for builds without the runtime. */
  find(input: string): RecordedRun | undefined {
    const files = (() => {
      try {
        return readdirSync(this.dir).filter(f => f.endsWith('.json')).sort()
      } catch {
        return []
      }
    })()
    for (const file of files) {
      const record = this.#read(file)
      if (record?.input === input) return record.run
    }
    return undefined
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
  }
}

export interface RunStats {
  /** Code nodes executed in this compilation. */
  executed: number
  /** Code nodes answered from the cache. */
  cached: number
}

export async function executePass(doc: IRDocument, executors: Executor[], cache: FreezeCache, report: (finding: Finding) => void): Promise<RunStats> {
  const stats: RunStats = { executed: 0, cached: 0 }
  for (const section of doc.sections) {
    for (const block of allBlocks(section.blocks)) {
      if (block.node.type !== 'code' || !block.node.run || block.node.run.when === 'live') continue
      await runCode(block.node, block, executors, cache, stats, (severity, message) =>
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
  report: (severity: Finding['severity'], message: string) => void,
): Promise<void> {
  const run = node.run!
  const request: RunRequest = { lang: run.lang, code: node.value }
  if (run.args) request.args = run.args
  if (run.stdin !== undefined) request.stdin = run.stdin
  if (run.timeoutMs !== undefined) request.timeoutMs = run.timeoutMs
  const input = hash({ lang: request.lang, code: request.code, args: request.args, stdin: request.stdin, executor: run.executor })
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
    const result = await executor.run(request)
    const recorded: RecordedRun = { ...result, cacheKey }
    node.outputs = [recorded]
    stats.executed++
    // A timeout depends on the machine, not on the code; it is not recorded.
    if (!result.timedOut) cache.record(cacheKey, input, request, recorded)
    if (!result.ok) report('warning', `block ${block.id} exited with ${result.timedOut ? 'a timeout' : `code ${result.exitCode}`}`)
  } catch (error) {
    report('error', `executor ${executor.id} failed on block ${block.id}: ${errorMessage(error)}`)
  }
}

function* allBlocks(blocks: IRBlock[]): Generator<IRBlock> {
  for (const block of blocks) {
    yield block
    if (block.node.type === 'component' && block.node.children) yield* allBlocks(block.node.children)
  }
}

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
