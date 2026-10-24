import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { availableRenderers, build, documentExporters, prepare, serveDirectory } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'
import { errorMessage } from '@lincyaw/kernel'
import { lookup } from 'mime-types'
import type { CompileJob, JobFile, Logger, OutputJobs, OutputTarget } from '@lincyaw/kernel'

/**
 * The documents' heavy outputs as jobs, one running at a time: the renderers' builds (the slides' site, the notebook, the
 * lecture) and the plugins' exporters (the slides as PDF or PowerPoint, the lecture as a video). A job shows its progress
 * and log; its files are kept below the service's `/__outputs/<job>/`, and a job of the same target and IR revision is
 * not run again.
 */

export const OUTPUTS_PATH = '/__outputs/'
const JOB_FILE = 'job.json'
// The last lines of a job's log the job keeps.
const LOG_LINES = 400
// The jobs a document keeps of each target, with their files.
const KEEP = 3
// The files a job lists (a site has many; the rest are still served).
const LISTED = 500
// Progress and log lines are told at most this often.
const TELL_MS = 250

export interface JobsOptions {
  stateDir: string
  /** The service's address, which the job's files are below. */
  url(): string
  compilation(document: string): Promise<Compilation>
  revision(compilation: Compilation): string
  /** The workbench's origins, whose pages may read the files (a video's captions). */
  origins: string[]
  log: Logger
}

export interface Jobs extends OutputJobs {
  get(id: string): CompileJob | undefined
  /** Where a job's output is on this machine: a renderer's site or files, an exporter's files. */
  directory(job: CompileJob): string
  /** Each change of a job (state, progress, log), as it happens. */
  subscribe(listener: (job: CompileJob) => void): () => void
  /** The address that serves the jobs' files (the service forwards `/__outputs/` to it). */
  origin(): Promise<string>
  close(): Promise<void>
}

interface Running {
  job: CompileJob
  dir: string
  controller: AbortController
  ended: Promise<CompileJob>
  end(): void
  told: number
  timer?: ReturnType<typeof setTimeout>
}

class Cancelled extends Error {
  constructor() {
    super('the job was cancelled')
  }
}

// Where an exporter's renderer project is written, inside the job's directory, removed when it ends.
const PREPARED = '.prepare'

const now = () => new Date().toISOString()
const newId = () => `${Date.now().toString(36)}${randomBytes(4).toString('hex')}`

/** A file of a job, its path relative to the job's directory, its media type by its extension (`mime-types`). */
function jobFile(root: string, path: string): JobFile {
  return { path: relative(root, path).split(sep).join('/'), size: statSync(path).size, type: lookup(path) || 'application/octet-stream' }
}

/** The files below `dir`, at most LISTED, paths relative to `root`. */
function listFiles(root: string, dir: string): JobFile[] {
  const files: JobFile[] = []
  const walk = (at: string) => {
    for (const entry of readdirSync(at, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (files.length >= LISTED) return
      const path = join(at, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && entry.name !== JOB_FILE) files.push(jobFile(root, path))
    }
  }
  if (existsSync(dir)) walk(dir)
  return files
}

/** The file of a renderer's output to open first: a site's page, else its first file. */
function mainFile(target: string, files: JobFile[]): string | undefined {
  return files.find(file => file.path === `${target}/index.html`)?.path ?? files.find(file => file.path.startsWith(`${target}/`))?.path
}

export function createJobs(options: JobsOptions): Jobs {
  const root = join(options.stateDir, 'outputs')
  // The jobs, oldest first, without their address (`present` adds it: the service's port changes between sessions).
  const jobs = new Map<string, CompileJob>()
  const running = new Map<string, Running>()
  const listeners = new Set<(job: CompileJob) => void>()
  let queue = Promise.resolve()
  let server: ReturnType<typeof serveDirectory> | undefined
  let closed = false

  const present = (job: CompileJob): CompileJob => ({ ...job, url: `${options.url()}${OUTPUTS_PATH}${job.id}/`, log: [...job.log], files: [...job.files] })

  // The jobs of earlier sessions whose files are still there.
  mkdirSync(root, { recursive: true })
  for (const id of readdirSync(root).sort()) {
    try {
      const job = JSON.parse(readFileSync(join(root, id, JOB_FILE), 'utf8')) as CompileJob
      if (job.state === 'done' && job.id === id) jobs.set(id, { ...job, sequence: job.sequence ?? 0 })
      else rmSync(join(root, id), { recursive: true, force: true })
    } catch {
      rmSync(join(root, id), { recursive: true, force: true })
    }
  }

  const tell = (job: CompileJob) => {
    job.sequence++
    const shown = present(job)
    for (const listener of listeners) listener(shown)
  }
  /** Tells a change at once (state), or within TELL_MS (progress, log). */
  const changed = (entry: Running, soon = false) => {
    clearTimeout(entry.timer)
    entry.timer = setTimeout(() => {
      entry.told = Date.now()
      tell(entry.job)
    }, soon ? 0 : Math.max(0, entry.told + TELL_MS - Date.now()))
  }

  /** Leaves the newest KEEP ended jobs of the document's target, with their files. */
  const prune = (document: string, target: string) => {
    const ended = [...jobs.values()].filter(job => job.document === document && job.target === target && !running.has(job.id))
    for (const job of ended.slice(0, Math.max(0, ended.length - KEEP))) {
      jobs.delete(job.id)
      rmSync(join(root, job.id), { recursive: true, force: true })
    }
  }

  const targetsOf = async (compilation: Compilation): Promise<OutputTarget[]> => {
    const renderers = await availableRenderers(compilation)
    const exports = (await documentExporters(compilation))
      .filter(({ exporter, config }) => !renderers.includes(exporter.id) && (exporter.available?.(compilation.doc, config) ?? true))
      .map(({ exporter }): OutputTarget => ({ id: exporter.id, kind: 'export', label: exporter.label }))
    return [...renderers.map((id): OutputTarget => ({ id, kind: 'render', label: { 'zh-CN': id, 'en': id } })), ...exports]
  }

  const run = async (entry: Running, compilation: Compilation) => {
    const { job, dir, controller } = entry
    const log = (line: string) => {
      job.log.push(line)
      if (job.log.length > LOG_LINES) job.log.splice(0, job.log.length - LOG_LINES)
      changed(entry)
    }
    const progress = (phase: string, done?: number, total?: number) => {
      job.progress = { phase, ...done === undefined ? {} : { done }, ...total === undefined ? {} : { total } }
      changed(entry)
    }
    if (job.kind === 'render') {
      progress(job.target)
      const report = await build(compilation, { outDir: dir, to: [job.target], base: `${OUTPUTS_PATH}${job.id}/${job.target}/`, log })
      if (controller.signal.aborted) throw new Cancelled()
      job.warnings = report.findings.filter(finding => finding.severity === 'warning').map(finding => finding.message)
      if (!report.outputs.some(output => output.renderer === job.target)) {
        throw new Error(report.findings.filter(finding => finding.severity === 'error').map(finding => finding.message).join('\n') || `the ${job.target} renderer made nothing`)
      }
      job.files = listFiles(dir, join(dir, job.target))
      job.main = mainFile(job.target, job.files)
      return
    }
    const found = (await documentExporters(compilation)).find(({ exporter }) => exporter.id === job.target)
    if (!found) throw new Error(`no plugin of the document exports ${job.target}`)
    const output = await found.exporter.run({
      deckDir: compilation.deckDir,
      workspaceRoot: compilation.workspaceRoot,
      config: found.config,
      outDir: dir,
      signal: controller.signal,
      progress,
      log,
      async prepare(renderer, config = {}) {
        const { renderers } = compilation.doc.config
        const configured = { ...compilation, doc: { ...compilation.doc, config: { ...compilation.doc.config, renderers: { ...renderers, [renderer]: { ...renderers[renderer], ...config } } } } }
        const report = await prepare(configured, { outDir: join(dir, PREPARED), to: [renderer], base: '/' })
        const own = report.outputs.find(o => o.renderer === renderer)
        if (!own) throw new Error(report.findings.filter(f => f.severity === 'error').map(f => f.message).join('; ') || `the ${renderer} renderer prepared nothing`)
        return own.workDir
      },
    })
    if (controller.signal.aborted) throw new Cancelled()
    rmSync(join(dir, PREPARED), { recursive: true, force: true })
    job.warnings = output.warnings ?? []
    const named = output.files.map(file => file.split(sep).join('/'))
    const first = named.flatMap(path => (existsSync(join(dir, path)) ? [jobFile(dir, join(dir, path))] : []))
    job.files = [...first, ...listFiles(dir, dir).filter(file => !named.includes(file.path))]
    job.main = first[0]?.path
    if (output.captions) job.captions = Object.fromEntries(Object.entries(output.captions).map(([lang, file]) => [lang, file.split(sep).join('/')]))
  }

  /** Runs the job once the ones before it have ended. */
  const schedule = (entry: Running, compilation: Compilation) => {
    queue = queue.then(async () => {
      const { job, controller } = entry
      if (job.state !== 'queued') return
      job.state = 'running'
      job.startedAt = now()
      changed(entry, true)
      try {
        mkdirSync(entry.dir, { recursive: true })
        await run(entry, compilation)
        job.state = 'done'
      } catch (error) {
        job.state = controller.signal.aborted ? 'cancelled' : 'failed'
        if (job.state === 'failed') job.error = errorMessage(error)
        options.log.warn(`the ${job.target} of ${job.document || '.'} ${job.state === 'cancelled' ? 'was cancelled' : `failed: ${job.error}`}`)
      }
      job.finishedAt = now()
      delete job.progress
      if (job.state === 'done') writeFileSync(join(entry.dir, JOB_FILE), `${JSON.stringify(job, null, 2)}\n`)
      else rmSync(entry.dir, { recursive: true, force: true })
      entry.end()
    })
  }

  return {
    async targets(document) {
      return await targetsOf(await options.compilation(document))
    },
    list(document) {
      return [...jobs.values()].filter(job => document === undefined || job.document === document).reverse().map(present)
    },
    get(id) {
      const job = jobs.get(id)
      return job && present(job)
    },
    directory: job => (job.kind === 'render' ? join(root, job.id, job.target) : join(root, job.id)),
    async start(document, target) {
      if (closed) throw new Error('the workspace service is closing')
      const compilation = await options.compilation(document)
      const revision = options.revision(compilation)
      const targets = await targetsOf(compilation)
      const known = targets.find(own => own.id === target)
      if (!known) throw new Error(`${document || '.'} cannot be made into ${target}: ${targets.map(own => own.id).join(', ') || 'nothing'}`)
      // The same target of the same revision, made or being made: not again.
      const same = [...jobs.values()].reverse().find(job => job.document === document && job.target === target && job.revision === revision && ['queued', 'running', 'done'].includes(job.state))
      if (same) return present(same)
      const id = newId()
      const job: CompileJob = { id, sequence: 0, document, target, kind: known.kind, state: 'queued', revision, createdAt: now(), url: '', files: [], warnings: [], log: [] }
      jobs.set(id, job)
      let resolve!: (job: CompileJob) => void
      const entry: Running = {
        job,
        dir: join(root, id),
        controller: new AbortController(),
        ended: new Promise<CompileJob>(done => resolve = done),
        end() {
          running.delete(id)
          clearTimeout(entry.timer)
          tell(job)
          prune(document, target)
          resolve(present(job))
        },
        told: 0,
      }
      running.set(id, entry)
      tell(job)
      schedule(entry, compilation)
      return present(job)
    },
    async wait(id) {
      const entry = running.get(id)
      if (entry) return await entry.ended
      const job = jobs.get(id)
      if (!job) throw new Error(`no job ${id}`)
      return present(job)
    },
    cancel(id) {
      const entry = running.get(id)
      if (!entry) return this.get(id)
      entry.controller.abort(new Cancelled())
      // A job still waiting ends now; a running one when its exporter or renderer stops.
      if (entry.job.state === 'queued') {
        entry.job.state = 'cancelled'
        entry.job.finishedAt = now()
        entry.end()
      }
      return present(entry.job)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    async origin() {
      server ??= serveDirectory(root, { base: OUTPUTS_PATH, origins: options.origins })
      return (await server).url
    },
    async close() {
      closed = true
      for (const id of [...running.keys()]) this.cancel(id)
      await queue
      if (server) await (await server).close()
    },
  }
}
