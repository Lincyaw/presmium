import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { chmodSync, constants, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { createInterface } from 'node:readline'
import type { Availability, BoxChange, Request, ReviewOpened, RunAnswer, RunParams } from './protocol.ts'
import { orphans, recordsDir, startTime } from './records.ts'
import type { SessionRecord } from './records.ts'

interface SessionInfo {
  session_id: string
  resolved_fs_mode: string
  host_visibility: 'immediate' | 'on-commit'
  isolation_provider: string | null
  mountpoint?: string
  degraded_protections?: string[]
}
interface Box {
  startSession(policy?: string, durability?: 'fast' | 'strict', groupCommitMs?: number, mode?: string, requireMode?: boolean): Promise<SessionInfo>
  stopSession(session: string): Promise<SessionInfo>
  exec(session: string, argv: string[], cwd?: string, env?: { key: string, value: string }[], label?: string): Promise<{ exit_code: number | null, stdout: string, stderr: string }>
  readFile(session: string, path: string): Promise<Buffer>
  writeFile(session: string, path: string, content: Buffer): Promise<void>
  checkpoint(session: string, label?: string): Promise<{ id: string }>
  diff(session: string, from?: string): Promise<{ changes: BoxChange[] }>
  commit(session: string): Promise<unknown>
  abort(session: string, checkpoint?: string): Promise<unknown>
}
interface Lite {
  binaryPath(): string
  loadNative(): { NativeDeltabox: new (project: string, binary: string, options: { stateDir: string, fsMode: string }) => Box }
}

const require = createRequire(import.meta.url)
const lite = require('deltabox-lite') as Lite
const VERSION = (require('deltabox-lite/package.json') as { version: string }).version
const MODE = 'cbcow-through'
const GLIBC = [2, 39]
const SYSTEM = ['/usr', '/bin', '/sbin', '/lib', '/lib32', '/lib64', '/etc'].filter(dir => existsSync(dir))
const SCRATCH = new Set(['HOME', 'TMPDIR', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME'])
const POOL = 4
const IDLE_MS = 60_000

const STATE: string = process.env.DELTABOX_STATE_DIR ?? ''
if (!STATE) throw new Error('DELTABOX_STATE_DIR is not set')
const OURS = join(STATE, 'presmium')
const RECORDS = recordsDir(STATE)
const SNAPSHOTS = join(OURS, 'snapshots')
const POLICIES = join(OURS, 'policies')
for (const dir of [RECORDS, SNAPSHOTS, POLICIES]) mkdirSync(dir, { recursive: true })

let native: ReturnType<Lite['loadNative']> | undefined
const box = (project: string): Box => new (native ??= lite.loadNative()).NativeDeltabox(project, lite.binaryPath(), { stateDir: STATE, fsMode: MODE })

const message = (error: unknown) => error instanceof Error ? error.message : String(error)
const inside = (path: string, dir: string) => path === dir || path.startsWith(dir + sep)

const TEMPORARY = /^presmium-(run|probe)-[\w]+$/
const temporary = (project: string) => dirname(project) === tmpdir() && TEMPORARY.test(basename(project))

function policy(read: string[]): string {
  const paths = ['.', ...new Set([...SYSTEM, ...read])]
  const text = `[filesystem]\nread = [${paths.map(p => JSON.stringify(p)).join(', ')}]\nwrite = ["."]\ndeny = []\n\n[network]\nmode = "deny_all"\n`
  const file = join(POLICIES, `${createHash('sha256').update(text).digest('hex').slice(0, 16)}.toml`)
  if (!existsSync(file)) {
    writeFileSync(`${file}.${process.pid}`, text)
    renameSync(`${file}.${process.pid}`, file)
  }
  return file
}

const SELF = { pid: process.pid, started: startTime(process.pid)! }
const recordFile = (session: string) => join(RECORDS, `${session}.json`)

type Entry = Omit<SessionRecord, 'helper'>

function record(entry: Entry): void {
  writeFileSync(recordFile(entry.session), JSON.stringify({ ...entry, helper: SELF }))
}

const registry = (project: string) => join(STATE, 'projects', createHash('sha256').update(project).digest('hex').slice(0, 16))

function forget(entry: Entry): void {
  sweep(entry)
  rmSync(recordFile(entry.session), { force: true })
  rmSync(join(STATE, entry.session), { recursive: true, force: true })
  if (entry.kind !== 'review') rmSync(registry(entry.project), { recursive: true, force: true })
  const runtime = entry.mount && dirname(entry.mount)
  if (!runtime || basename(runtime) !== entry.session) return
  try {
    if (statSync(entry.mount!).dev !== statSync(runtime).dev) return
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return
  }
  rmSync(runtime, { recursive: true, force: true })
}

interface Proc { pid: number, ppid: number, pgid: number, cmdline: string }

function processes(): Proc[] {
  const list: Proc[] = []
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
      const [, ppid, pgid] = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      list.push({ pid: Number(name), ppid: Number(ppid), pgid: Number(pgid), cmdline: readFileSync(`/proc/${name}/cmdline`, 'utf8') })
    } catch {}
  }
  return list
}

function descendants(all: Proc[], pid: number): Proc[] {
  const children = all.filter(p => p.ppid === pid)
  return [...children, ...children.flatMap(child => descendants(all, child.pid))]
}

function kill(pids: number[]): void {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }
}

const sessionProcesses = (all: Proc[], session: string) => all.filter(p => p.cmdline.includes(`/${session}/`) && p.pid !== process.pid)

function openFiles(pid: number): string[] {
  try {
    return readdirSync(`/proc/${pid}/fd`).flatMap((fd) => {
      try {
        return [readlinkSync(`/proc/${pid}/fd/${fd}`)]
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

function worksIn(pid: number, session: string): boolean {
  try {
    return `${readlinkSync(`/proc/${pid}/cwd`)}/`.includes(`/${session}/`)
  } catch {
    return false
  }
}

function killCommand(session: string): void {
  const all = processes()
  const own = sessionProcesses(all, session)
  const worker = own.find(p => p.cmdline.split('\0')[1] === 'worker')
  if (!worker) return
  const pipes = new Set(openFiles(worker.pid).filter(file => file.startsWith('pipe:')))
  const spared = new Set([process.pid, ...own.map(p => p.pid)])
  const left = all.filter(p => !spared.has(p.pid) && (p.pgid === worker.pid || worksIn(p.pid, session) || openFiles(p.pid).some(file => pipes.has(file))))
  kill([...descendants(all, worker.pid), ...left].map(p => p.pid))
}

function sweep(entry: Entry): void {
  const all = processes()
  const left = sessionProcesses(all, entry.session)
  if (left.length === 0) return
  kill([...left.flatMap(p => descendants(all, p.pid)), ...left].map(p => p.pid))
  if (entry.mount) unmount(entry.mount)
}

function unmount(mount: string): void {
  for (const command of ['fusermount3', 'fusermount']) {
    if (spawnSync(command, ['-u', '-z', mount], { stdio: 'ignore' }).status === 0) break
  }
}

async function fromSnapshot(entry: Entry, it: Box): Promise<void> {
  await it.stopSession(entry.session).catch(() => {})
  const all = processes()
  const own = sessionProcesses(all, entry.session)
  kill([...own.flatMap(p => descendants(all, p.pid)), ...own].map(p => p.pid))
  if (entry.mount) unmount(entry.mount)
  mirror(entry.snapshot!, entry.project)
  rmSync(registry(entry.project), { recursive: true, force: true })
}

async function recover(): Promise<string[]> {
  const recovered: string[] = []
  for (const [name, entry] of orphans(STATE)) {
    if (!/^[\w-]+$/.test(entry.session)) continue
    const claimed = join(RECORDS, `${name}.${process.pid}`)
    try {
      renameSync(join(RECORDS, name), claimed)
    } catch {
      continue
    }
    const all = processes()
    const own = sessionProcesses(all, entry.session)
    kill([...own.flatMap(p => descendants(all, p.pid)), ...own].map(p => p.pid))
    let restored = false
    let stopped = false
    const it = box(entry.project)
    try {
      await it.abort(entry.session)
      restored = true
    } catch (error) {
      if (entry.kind === 'review' && entry.snapshot && inside(entry.snapshot, SNAPSHOTS) && copyable(entry.snapshot)) {
        await fromSnapshot(entry, it)
        restored = stopped = true
      } else {
        process.stderr.write(`recovering deltabox session ${entry.session} of ${entry.project}: ${message(error)}\n`)
      }
    }
    if (!stopped) await it.stopSession(entry.session).catch(() => {})
    if (entry.kind !== 'review' && temporary(entry.project)) rmSync(entry.project, { recursive: true, force: true })
    if (entry.snapshot && restored && inside(entry.snapshot, SNAPSHOTS)) rmSync(entry.snapshot, { recursive: true, force: true })
    rmSync(claimed, { force: true })
    forget(entry)
    if (entry.kind === 'review') recovered.push(entry.project)
  }
  return recovered
}

function glibc(): string | undefined {
  const header = (process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined)?.header
  return header?.glibcVersionRuntime
}

async function probe(): Promise<Availability> {
  if (process.platform === 'darwin') return { ok: false, reason: 'macos', detail: process.arch }
  if (process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch)) return { ok: false, reason: 'platform', detail: `${process.platform}-${process.arch}` }
  const found = glibc()
  const [major = 0, minor = 0] = (found ?? '').split('.').map(Number)
  if (!found || major < GLIBC[0]! || (major === GLIBC[0] && minor < GLIBC[1]!)) return { ok: false, reason: 'glibc', detail: found ?? 'none (not glibc)' }
  try {
    native ??= lite.loadNative()
  } catch (error) {
    return { ok: false, reason: 'binding', detail: message(error) }
  }
  const project = mkdtempSync(join(tmpdir(), 'presmium-probe-'))
  const it = box(project)
  let entry: Entry | undefined
  try {
    const info = await it.startSession(policy([]), 'fast', undefined, MODE, true)
    entry = { session: info.session_id, kind: 'probe', project, ...info.mountpoint ? { mount: info.mountpoint } : {} }
    record(entry)
    if (info.resolved_fs_mode !== MODE) return { ok: false, reason: 'start', detail: `resolved ${info.resolved_fs_mode}` }
    if (info.isolation_provider !== 'sandlock') return { ok: false, reason: 'isolation', detail: info.isolation_provider ?? 'none' }
    if (info.degraded_protections?.length) return { ok: false, reason: 'degraded', detail: info.degraded_protections.join(', ') }
    const ran = await it.exec(entry.session, ['true'])
    if (ran.exit_code !== 0) return { ok: false, reason: 'start', detail: ran.stderr.trim() || `true exited with ${ran.exit_code}` }
    return { ok: true, kind: `deltabox ${MODE}`, version: VERSION, isolation: info.isolation_provider }
  } catch (error) {
    return { ok: false, reason: 'start', detail: message(error) }
  } finally {
    if (entry) {
      await it.stopSession(entry.session).catch(() => {})
      forget(entry)
    }
    rmSync(project, { recursive: true, force: true })
  }
}

interface RunSession {
  session: string
  project: string
  mount: string
  box: Box
  entry?: Entry
  timer?: NodeJS.Timeout
}

interface Pool {
  policy: string
  sessions: RunSession[]
  idle: RunSession[]
  waiting: { resolve(slot: RunSession): void, reject(error: unknown): void }[]
}

const pools = new Map<string, Pool>()
const stops = new Map<number, () => void>()
const stopping = new Set<Promise<void>>()

function acquire(read: string[]): { pool: Pool, slot: Promise<RunSession> } {
  const file = policy(read)
  let pool = pools.get(file)
  if (!pool) pools.set(file, pool = { policy: file, sessions: [], idle: [], waiting: [] })
  const idle = pool.idle.pop()
  clearTimeout(idle?.timer)
  if (idle) return { pool, slot: Promise.resolve(idle) }
  if (pool.sessions.length >= POOL) return { pool, slot: new Promise((resolve, reject) => pool.waiting.push({ resolve, reject })) }
  return { pool, slot: start(pool) }
}

async function start(pool: Pool): Promise<RunSession> {
  const project = mkdtempSync(join(tmpdir(), 'presmium-run-'))
  const slot: RunSession = { session: '', project, mount: project, box: box(project) }
  pool.sessions.push(slot)
  try {
    const info = await slot.box.startSession(pool.policy, 'fast', undefined, MODE, true)
    const entry: Entry = { session: info.session_id, kind: 'run', project, ...info.mountpoint ? { mount: info.mountpoint } : {} }
    record(entry)
    return Object.assign(slot, { session: info.session_id, mount: info.mountpoint ?? project, entry })
  } catch (error) {
    pool.sessions.splice(pool.sessions.indexOf(slot), 1)
    rmSync(project, { recursive: true, force: true })
    throw error
  }
}

function release(pool: Pool, slot: RunSession, broken: boolean): void {
  if (broken) retire(pool, slot)
  const next = pool.waiting.shift()
  if (!next) {
    if (broken) return
    pool.idle.push(slot)
    slot.timer = setTimeout(() => retire(pool, slot), IDLE_MS).unref()
    return
  }
  if (broken) start(pool).then(next.resolve, next.reject)
  else next.resolve(slot)
}

function retire(pool: Pool, slot: RunSession): void {
  pool.sessions.splice(pool.sessions.indexOf(slot), 1)
  if (pool.idle.includes(slot)) pool.idle.splice(pool.idle.indexOf(slot), 1)
  if (pool.sessions.length === 0 && pool.waiting.length === 0) pools.delete(pool.policy)
  const stopped = stopRun(slot).finally(() => stopping.delete(stopped))
  stopping.add(stopped)
}

async function stopRun(slot: RunSession): Promise<void> {
  if (slot.entry) {
    await slot.box.abort(slot.session).catch(() => {})
    await slot.box.stopSession(slot.session).catch(() => {})
    forget(slot.entry)
  }
  rmSync(slot.project, { recursive: true, force: true })
}

async function run(id: number, params: RunParams): Promise<RunAnswer> {
  const none: RunAnswer = { exitCode: null, stdout: '', stderr: '', files: {} }
  let stopped = false
  let running: string | undefined
  const stop = () => {
    stopped = true
    if (running) killCommand(running)
  }
  stops.set(id, stop)
  const { pool, slot: acquired } = acquire(params.read)
  let slot: RunSession
  try {
    slot = await acquired
  } catch (error) {
    stops.delete(id)
    throw error
  }
  let broken = false
  try {
    if (stopped) return none
    for (const [path, content] of Object.entries(params.files)) await slot.box.writeFile(slot.session, path, Buffer.from(content, 'base64'))
    if (stopped) return none
    const env = Object.entries(params.env).filter(([key]) => !SCRATCH.has(key)).map(([key, value]) => ({ key, value }))
    running = slot.session
    const timer = setTimeout(stop, params.timeoutMs)
    const ran = await slot.box.exec(slot.session, params.argv, undefined, env, 'presmium-run').finally(() => {
      clearTimeout(timer)
      running = undefined
      killCommand(slot.session)
    })
    const files: Record<string, string> = {}
    for (const path of params.collect) {
      try {
        files[path] = (await slot.box.readFile(slot.session, path)).toString('base64')
      } catch {}
    }
    const stderr = ran.stderr.replaceAll(slot.mount, '.').replaceAll(slot.project, '.')
    return { exitCode: stopped ? null : ran.exit_code, stdout: ran.stdout, stderr, files }
  } catch (error) {
    broken = true
    throw error
  } finally {
    stops.delete(id)
    try {
      await slot.box.abort(slot.session)
    } catch {
      broken = true
    }
    release(pool, slot, broken)
  }
}

interface Review { session: string, project: string, snapshot: string, box: Box, entry: Entry }

const reviews = new Map<string, Review>()
const reviewed = new Set<string>()

function copyable(path: string): boolean {
  try {
    const stat = lstatSync(path)
    return stat.isFile() || stat.isDirectory() || stat.isSymbolicLink()
  } catch {
    return false
  }
}

async function openReview(params: { project: string }): Promise<ReviewOpened> {
  const project = realpathSync(params.project)
  if (reviewed.has(project)) throw new Error(`busy: a review of ${project} is open`)
  reviewed.add(project)
  const snapshot = join(SNAPSHOTS, randomUUID())
  const it = box(project)
  let info: SessionInfo
  try {
    cpSync(project, snapshot, { recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true, preserveTimestamps: true, filter: copyable })
    info = await it.startSession(policy([]), 'fast', undefined, MODE, true)
  } catch (error) {
    reviewed.delete(project)
    rmSync(snapshot, { recursive: true, force: true })
    throw new Error(/session busy/i.test(message(error)) ? `busy: ${message(error)}` : message(error))
  }
  const entry: Entry = { session: info.session_id, kind: 'review', project, snapshot, ...info.mountpoint ? { mount: info.mountpoint } : {} }
  record(entry)
  reviews.set(info.session_id, { session: info.session_id, project, snapshot, box: it, entry })
  return { session: info.session_id, root: info.mountpoint ?? project, visibility: info.host_visibility }
}

function review(session: unknown): Review {
  const found = reviews.get(String(session))
  if (!found) throw new Error(`no open review ${String(session)}`)
  return found
}

async function fileChanges(r: Review, from?: string): Promise<BoxChange[]> {
  const { changes } = await r.box.diff(r.session, from)
  return changes.filter(change => change.old_size !== null || change.new_size !== null)
}

async function step(params: { session: string, from?: string, checkpoint: boolean, label: string }): Promise<{ changes: BoxChange[], checkpoint?: string }> {
  const r = review(params.session)
  const changes = await fileChanges(r, params.from)
  const checkpoint = params.checkpoint ? (await r.box.checkpoint(r.session, params.label)).id : undefined
  return { changes, ...checkpoint ? { checkpoint } : {} }
}

async function endReview(r: Review, stopped = false): Promise<void> {
  reviews.delete(r.session)
  if (!stopped) await r.box.stopSession(r.session).catch(() => {})
  forget(r.entry)
  rmSync(r.snapshot, { recursive: true, force: true })
  reviewed.delete(r.project)
}

function alike(a: string, b: string): boolean {
  try {
    const [x, y] = [lstatSync(a), lstatSync(b)]
    if (x.isSymbolicLink() || y.isSymbolicLink()) return x.isSymbolicLink() && y.isSymbolicLink() && readlinkSync(a) === readlinkSync(b)
    if (x.isDirectory() || y.isDirectory()) return x.isDirectory() && y.isDirectory()
    return x.isFile() && y.isFile() && (x.mode & 0o7777) === (y.mode & 0o7777) && x.size === y.size && readFileSync(a).equals(readFileSync(b))
  } catch {
    return false
  }
}

function mirror(source: string, target: string): void {
  const wanted = new Set(readdirSync(source).filter(name => copyable(join(source, name))))
  for (const name of readdirSync(target)) {
    if (!wanted.has(name)) rmSync(join(target, name), { recursive: true, force: true })
  }
  for (const name of wanted) {
    const from = join(source, name)
    const to = join(target, name)
    if (!alike(from, to)) {
      rmSync(to, { recursive: true, force: true })
      const stat = lstatSync(from)
      if (stat.isSymbolicLink()) symlinkSync(readlinkSync(from), to)
      else if (stat.isDirectory()) mkdirSync(to)
      else {
        copyFileSync(from, to, constants.COPYFILE_FICLONE)
        chmodSync(to, stat.mode & 0o7777)
      }
    }
    if (lstatSync(from).isDirectory() && !lstatSync(to).isSymbolicLink()) mirror(from, to)
  }
}

function restore(r: Review, path: string): void {
  const target = resolve(r.project, path)
  if (!inside(target, r.project) || target === r.project) return
  const saved = join(r.snapshot, relative(r.project, target))
  rmSync(target, { recursive: true, force: true })
  if (copyable(saved)) {
    mkdirSync(dirname(target), { recursive: true })
    const stat = lstatSync(saved)
    if (stat.isSymbolicLink()) symlinkSync(readlinkSync(saved), target)
    else if (stat.isDirectory()) cpSync(saved, target, { recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true, preserveTimestamps: true, filter: copyable })
    else {
      copyFileSync(saved, target, constants.COPYFILE_FICLONE)
      chmodSync(target, stat.mode & 0o7777)
    }
    return
  }
  for (let dir = dirname(target); dir !== r.project && inside(dir, r.project) && !existsSync(join(r.snapshot, relative(r.project, dir))); dir = dirname(dir)) {
    try {
      rmdirSync(dir)
    } catch {
      break
    }
  }
}

async function accept(params: { session: string, reject: string[] }): Promise<{ files: string[] }> {
  const r = review(params.session)
  const changed = (await fileChanges(r)).map(change => change.path)
  await r.box.commit(r.session)
  reviews.delete(r.session)
  await r.box.stopSession(r.session).catch(() => {})
  forget(r.entry)
  const reject = new Set(params.reject.filter(path => changed.includes(path)))
  for (const path of reject) restore(r, path)
  rmSync(r.snapshot, { recursive: true, force: true })
  reviewed.delete(r.project)
  const rejected = (path: string) => [...reject].some(file => path === file || path.startsWith(`${file}/`))
  return { files: changed.filter(path => !rejected(path)) }
}

async function restoreTo(params: { session: string, checkpoint?: string }): Promise<Record<string, never>> {
  const r = review(params.session)
  await r.box.abort(r.session, params.checkpoint)
  return {}
}

async function rollback(params: { session: string }): Promise<{ fromSnapshot?: true }> {
  const r = review(params.session)
  let restored = false
  try {
    await r.box.abort(r.session)
  } catch (error) {
    process.stderr.write(`the deltabox session ${r.session} of ${r.project} did not abort (${message(error)}): restored from the review's snapshot\n`)
    await fromSnapshot(r.entry, r.box)
    restored = true
  }
  await endReview(r, restored)
  return restored ? { fromSnapshot: true } : {}
}

const METHODS: Record<string, (params: never, id: number) => Promise<unknown>> = {
  'run': (params: RunParams, id: number) => run(id, params),
  'cancel': async (params: { request: number }) => {
    stops.get(params.request)?.()
    return {}
  },
  'review.open': openReview,
  'review.step': step,
  'review.diff': async (params: { session: string }) => ({ changes: await fileChanges(review(params.session)) }),
  'review.accept': accept,
  'review.restore': restoreTo,
  'review.rollback': rollback,
}

function answer(line: object): void {
  process.stdout.write(`${JSON.stringify(line)}\n`)
}

async function shutdown(): Promise<void> {
  await Promise.all([
    ...[...reviews.values()].map(r => rollback({ session: r.session }).catch(() => {})),
    ...[...pools.values()].flatMap(pool => pool.sessions).map((slot) => {
      clearTimeout(slot.timer)
      killCommand(slot.session)
      return stopRun(slot)
    }),
    ...stopping,
  ])
}

async function serve(): Promise<void> {
  await recover()
  const lines = createInterface({ input: process.stdin })
  lines.on('line', (line) => {
    let request: Request
    try {
      request = JSON.parse(line) as Request
    } catch {
      return
    }
    const method = METHODS[request.method]
    if (!method) return answer({ id: request.id, error: `unknown method ${request.method}` })
    method(request.params as never, request.id).then(
      result => answer({ id: request.id, result }),
      error => answer({ id: request.id, error: message(error) }),
    )
  })
  lines.on('close', () => void shutdown().finally(() => process.exit(0)))
}

if (process.argv[2] === 'probe') {
  const recovered = await recover()
  answer({ ...await probe(), recovered })
} else {
  await serve()
}
