/**
 * The deltabox helper (docs/architecture.md 10.6, 10.7): the one process that
 * loads deltabox's Node binding. The plugin starts it with an environment of
 * `PATH`, `HOME` and `DELTABOX_STATE_DIR` only, so deltabox's own helpers and
 * the commands they run descend from a process that holds no secret.
 * Requests come on standard input and answers go to standard output, one JSON
 * object per line (./protocol.ts); the command line is for diagnostics:
 * `node helper.ts probe` cleans up what crashed helpers left and prints
 * whether this host qualifies.
 *
 * Sessions are cbcow-through (`require_fs_mode`), isolated by sandlock, with
 * no deny rules (a sandboxed `rm -rf` of a denied directory faults the engine
 * and loses data, docs/architecture.md 9.5):
 * - a review: one session on a document directory, which an agent outside
 *   the sandbox writes through the session's view; the directory is copied
 *   (reflink where the file system has it) before the session starts, the
 *   snapshot that rejected files go back to after `commit`; going back to
 *   before a step aborts to the checkpoint before it. A session that faulted
 *   (deltabox's `abort` fails) is rolled back from the snapshot instead: the
 *   session's processes are ended, its view unmounted, the directory made
 *   as the snapshot has it, and the directory is free again;
 * - runs: warm sessions on run directories of their own, network `deny_all`,
 *   the system's directories and the given paths read-only; the inputs are
 *   written through the session, the results read through it (a link out of
 *   the run directory is refused), then what the command left running is
 *   ended and `abort` empties the directory for the next run. A session idle
 *   for `IDLE_MS` is stopped.
 *
 * Each session is recorded in `<state>/presmium/sessions/` with this
 * process's pid and start time (./records.ts). A helper that starts recovers
 * the sessions of helpers that are gone: it kills deltabox's processes of
 * the session, aborts it (which restores the document directory; from the
 * snapshot when the abort fails) and stops it. When its standard input
 * closes (the plugin's process ended), the helper rolls back its reviews,
 * stops its sessions and exits.
 */
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

// deltabox-lite's types (index.d.ts), the parts used here.
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
/** glibc of deltabox's prebuilt binaries (Ubuntu 24.04). */
const GLIBC = [2, 39]
/** The system's directories a run may read. */
const SYSTEM = ['/usr', '/bin', '/sbin', '/lib', '/lib32', '/lib64', '/etc'].filter(dir => existsSync(dir))
/** Variables deltabox gives every command a session-scratch value of. */
const SCRATCH = new Set(['HOME', 'TMPDIR', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME'])
/** Warm sessions per set of readable paths, so runs sent together run side by side. */
const POOL = 4
/** How long a warm session waits for its next run before it is stopped. */
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

/** A run or probe directory this helper makes, which only it removes. */
const TEMPORARY = /^presmium-(run|probe)-[\w]+$/
const temporary = (project: string) => dirname(project) === tmpdir() && TEMPORARY.test(basename(project))

// Policies ---------------------------------------------------------------------------

/** A policy file: the project writable, these paths readable, no deny rules, no network. */
function policy(read: string[]): string {
  const paths = ['.', ...new Set([...SYSTEM, ...read])]
  const text = `[filesystem]\nread = [${paths.map(p => JSON.stringify(p)).join(', ')}]\nwrite = ["."]\ndeny = []\n\n[network]\nmode = "deny_all"\n`
  const file = join(POLICIES, `${createHash('sha256').update(text).digest('hex').slice(0, 16)}.toml`)
  // Helpers of other processes read it too: written whole, then renamed into place.
  if (!existsSync(file)) {
    writeFileSync(`${file}.${process.pid}`, text)
    renameSync(`${file}.${process.pid}`, file)
  }
  return file
}

// Records and processes ----------------------------------------------------------------

const SELF = { pid: process.pid, started: startTime(process.pid)! }
const recordFile = (session: string) => join(RECORDS, `${session}.json`)

type Entry = Omit<SessionRecord, 'helper'>

function record(entry: Entry): void {
  writeFileSync(recordFile(entry.session), JSON.stringify({ ...entry, helper: SELF }))
}

/** deltabox's registry of a project's sessions, with its leases of the project: `projects/<sha-256 of the path>`. */
const registry = (project: string) => join(STATE, 'projects', createHash('sha256').update(project).digest('hex').slice(0, 16))

/**
 * Forgets a stopped session: its record, deltabox's state of it and its
 * runtime directory (that of the mount point, once nothing is mounted
 * there: removing a directory with the view still mounted in it would
 * delete through the view), and for a run directory, which is not used
 * again, deltabox's registry entry of it (`projects/<sha-256 of the path>`).
 */
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

/** deltabox's processes of a session (file system helper, command helper, worker): their arguments name its directories. */
const sessionProcesses = (all: Proc[], session: string) => all.filter(p => p.cmdline.includes(`/${session}/`) && p.pid !== process.pid)

/** What a process has open (`pipe:[<inode>]`, paths); nothing when it is gone. */
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

/** Whether a process works in the session's runtime directory (its view, the command's home). */
function worksIn(pid: number, session: string): boolean {
  try {
    return `${readlinkSync(`/proc/${pid}/cwd`)}/`.includes(`/${session}/`)
  } catch {
    return false
  }
}

/**
 * Ends what a session's command runs, the worker staying warm: everything
 * below the worker, what is left of its process group (the worker leads
 * it), and what left both with `setsid`: a process holding the command's
 * output pipes, which the worker reads (deltabox's `exec` waits until they
 * close), or working in the session's runtime directory.
 */
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

/**
 * After a session stopped: deltabox's processes of it that are still
 * running (its stop failed, e.g. its state was removed meanwhile) are killed
 * and the view, left without its file system helper, is unmounted.
 */
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

/**
 * A review whose session deltabox cannot abort (it faulted): deltabox's
 * processes of it ended, its view unmounted, the document directory made as
 * the snapshot taken when the review opened has it, and deltabox's registry
 * of the directory removed (the faulted session keeps its exclusive lease
 * there), so the directory is free for the next review. The review's
 * session was the directory's only one: deltabox leases it exclusively. Its
 * stop comes first (it fails, but would write the registry again after).
 */
async function fromSnapshot(entry: Entry, it: Box): Promise<void> {
  await it.stopSession(entry.session).catch(() => {})
  const all = processes()
  const own = sessionProcesses(all, entry.session)
  kill([...own.flatMap(p => descendants(all, p.pid)), ...own].map(p => p.pid))
  if (entry.mount) unmount(entry.mount)
  mirror(entry.snapshot!, entry.project)
  rmSync(registry(entry.project), { recursive: true, force: true })
}

/** The sessions of helpers that are gone: deltabox's processes killed, the session aborted (restoring a document directory) and stopped; returns the document directories restored. */
async function recover(): Promise<string[]> {
  const recovered: string[] = []
  for (const [name, entry] of orphans(STATE)) {
    if (!/^[\w-]+$/.test(entry.session)) continue
    // Claimed by renaming, so a helper starting at the same time leaves it.
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
      // A session deltabox cannot abort any more: the document directory comes back from the snapshot.
      if (entry.kind === 'review' && entry.snapshot && inside(entry.snapshot, SNAPSHOTS) && copyable(entry.snapshot)) {
        await fromSnapshot(entry, it)
        restored = stopped = true
      } else {
        process.stderr.write(`recovering deltabox session ${entry.session} of ${entry.project}: ${message(error)}\n`)
      }
    }
    if (!stopped) await it.stopSession(entry.session).catch(() => {})
    if (entry.kind !== 'review' && temporary(entry.project)) rmSync(entry.project, { recursive: true, force: true })
    // Without a restore the snapshot stays, for the operator to restore from.
    if (entry.snapshot && restored && inside(entry.snapshot, SNAPSHOTS)) rmSync(entry.snapshot, { recursive: true, force: true })
    rmSync(claimed, { force: true })
    forget(entry)
    if (entry.kind === 'review') recovered.push(entry.project)
  }
  return recovered
}

// Availability ------------------------------------------------------------------------------

function glibc(): string | undefined {
  const header = (process.report?.getReport() as { header?: { glibcVersionRuntime?: string } } | undefined)?.header
  return header?.glibcVersionRuntime
}

/** Whether this host qualifies (docs/architecture.md 10.6): Linux x64 or arm64, glibc 2.39, the binding, cbcow-through started strictly, isolated by sandlock, no degraded protection. */
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
    // Commands start under sandlock (Landlock and seccomp), not only the file system.
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

// Runs ----------------------------------------------------------------------------------------------

interface RunSession {
  session: string
  project: string
  mount: string
  box: Box
  entry?: Entry
  /** Stops the session once it has been idle for `IDLE_MS`. */
  timer?: NodeJS.Timeout
}

/** The warm sessions of one policy (one set of readable paths): idle ones, and runs waiting for one. */
interface Pool {
  policy: string
  sessions: RunSession[]
  idle: RunSession[]
  waiting: { resolve(slot: RunSession): void, reject(error: unknown): void }[]
}

const pools = new Map<string, Pool>()
/** Ends the command of a run under way, by request id. */
const stops = new Map<number, () => void>()
/** Broken or idle sessions being stopped. */
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

/** Gives a session back after a run; a broken one is stopped, and a run waiting gets a new one. */
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

/** Takes a session out of its pool (and an empty pool out of the map) and stops it. */
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
  // A timeout or a cancel ends the command under way; before it starts, the run does not start.
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
      // What the command left running (in the background, or detached with `setsid`) ends with the run.
      killCommand(slot.session)
    })
    const files: Record<string, string> = {}
    for (const path of params.collect) {
      try {
        files[path] = (await slot.box.readFile(slot.session, path)).toString('base64')
      } catch {}
    }
    // Paths of this machine stay out of the recordings (K-13), as without the sandbox.
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

// Reviews ------------------------------------------------------------------------------------------

interface Review { session: string, project: string, snapshot: string, box: Box, entry: Entry }

const reviews = new Map<string, Review>()
/** Document directories whose review is opening or open. */
const reviewed = new Set<string>()

/** What a snapshot holds: files, directories and links (no sockets or devices). */
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
    // Another process's review of the directory holds deltabox's lease of it.
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

/** The changes of files and links since a checkpoint (or the session's start): deltabox lists directories too, with neither size. */
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

/** Ends a review: the session stopped and forgotten, the snapshot removed. */
async function endReview(r: Review, stopped = false): Promise<void> {
  reviews.delete(r.session)
  if (!stopped) await r.box.stopSession(r.session).catch(() => {})
  forget(r.entry)
  rmSync(r.snapshot, { recursive: true, force: true })
  reviewed.delete(r.project)
}

/** Whether two entries are alike: kind, mode, content or target (a directory is alike when it is one). */
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

/** Makes `target` as `source` has it: what source lacks is removed, what differs copied over. */
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

/** A path of the document directory back to the snapshot: copied from it, or deleted (with the directories the task made) when it has none. */
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
  // deltabox cannot take back one path: the rejected files come back from the snapshot after the commit.
  const reject = new Set(params.reject.filter(path => changed.includes(path)))
  for (const path of reject) restore(r, path)
  rmSync(r.snapshot, { recursive: true, force: true })
  reviewed.delete(r.project)
  // A file restored where the task had made a directory took the directory's files with it.
  const rejected = (path: string) => [...reject].some(file => path === file || path.startsWith(`${file}/`))
  return { files: changed.filter(path => !rejected(path)) }
}

/** Back to the checkpoint before a step (or the session's start): the review goes on. */
async function restoreTo(params: { session: string, checkpoint?: string }): Promise<Record<string, never>> {
  const r = review(params.session)
  await r.box.abort(r.session, params.checkpoint)
  return {}
}

/**
 * Rejects all and ends the review. A session deltabox cannot abort (it
 * faulted) is rolled back from the snapshot: its processes ended, its view
 * unmounted, the directory made as the snapshot has it.
 */
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

// Serving ----------------------------------------------------------------------------------------------

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

/** Rolls back the reviews and stops the sessions of this helper, as the plugin's process ended. */
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
