// The cloud's control service inside one user's Studio container, on 127.0.0.1 only. The single-user server proxies
// it at /user/<name>/cloud/ after JupyterHub has authenticated the request (the owner, or the console's service
// token), so it has no credential of its own. Every file operation runs here, as the owner's unprivileged user.
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PRESMIUM = '/opt/presmium'
const SPACE = '/work/space'
const SCRATCH = join('/work', 'cache', 'cloud')
const STUDIO_STATE = join(process.env.XDG_STATE_HOME ?? '/work/state', 'presmium', 'studio')
const PORT = Number(process.argv[2] ?? 18997)

const git = (args, options = {}) => run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args], { cwd: SPACE, maxBuffer: 64 << 20, ...options })

/** The workspace service of the Studio, from the state file it writes (0600) under the cache home. */
function service() {
  const root = join(process.env.XDG_CACHE_HOME ?? '/work/cache', 'presmium', 'serve')
  const files = existsSync(root) ? readdirSync(root).map(dir => join(root, dir, 'server.json')).filter(file => existsSync(file)) : []
  const newest = files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  if (!newest) return undefined
  const state = JSON.parse(readFileSync(newest, 'utf8'))
  return typeof state.url === 'string' && typeof state.mcp === 'string' && typeof state.token === 'string' ? state : undefined
}

/**
 * How far this Studio's start has come, for the console's progress screen: the workspace being copied (a new author's
 * first start), Studio starting, or ready once Studio's state file holds its address with the launch token.
 */
function stage() {
  if (!existsSync(SPACE) || readdirSync(SPACE).length === 0) return 'workspace'
  const files = existsSync(STUDIO_STATE) ? readdirSync(STUDIO_STATE).filter(name => name.endsWith('.json')) : []
  for (const name of files) {
    try { if (String(JSON.parse(readFileSync(join(STUDIO_STATE, name), 'utf8')).url ?? '').includes('?token=')) return 'ready' } catch { /* Being written. */ }
  }
  return 'studio'
}

/**
 * The workspace's documents in the order of its document tree (depth first, siblings by rank), as the workspace
 * service's `tree` route answers: every `index.pmd` in the workspace, nested documents included, the trash not.
 */
async function documents() {
  const state = service()
  if (!state?.launcherToken) throw Object.assign(new Error('studio-starting'), { status: 409 })
  const response = await fetch(`${state.url}/__presmium/presmium.workspace/tree`, { headers: { authorization: `Bearer ${state.launcherToken}` }, signal: AbortSignal.timeout(20_000) })
  if (!response.ok) throw Object.assign(new Error('studio-starting'), { status: 409 })
  const tree = await response.json()
  const found = [], seen = new Set()
  const visit = (id, depth) => {
    const node = tree.nodes?.[id]
    if (!node || seen.has(id)) return
    seen.add(id)
    found.push({ document: node.path, id: node.id, title: String(node.title || node.path).slice(0, 200), depth, parent: node.parent ?? null })
    for (const child of node.children ?? []) visit(child, depth + 1)
  }
  for (const id of tree.roots ?? []) visit(id, 0)
  return found
}

/** A document folder relative to the workspace: plain path segments, none hidden. */
const isDocument = path => typeof path === 'string' && path.length <= 200 && path.split('/').every(part => /^[^/\\\0.][^/\\\0]*$/.test(part))
const snapshots = new Map()

/**
 * A shared document as it is saved now: its source archive, and its web site built for `base`. Studio saves to the
 * workspace's files and keeps its history apart from the workspace's own git commits, so the archive takes the files
 * of the document's folder that git would not ignore, committed or not.
 */
async function snapshot(document, base) {
  if (!isDocument(document) || !existsSync(join(SPACE, document, 'index.pmd'))) throw Object.assign(new Error('document-not-found'), { status: 404 })
  if (!/^\/[A-Za-z0-9/_-]+\/$/.test(base)) throw Object.assign(new Error('share-base-invalid'), { status: 400 })
  const id = randomBytes(16).toString('hex'), dir = join(SCRATCH, id)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  try {
    const folder = join(SPACE, document)
    const { stdout } = await git(['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'], { cwd: folder })
    const files = [...new Set(stdout.split('\0').filter(Boolean))].filter(file => existsSync(join(folder, file)))
    await writeFile(join(dir, 'files'), files.join('\0'))
    await run('tar', ['-czf', join(dir, 'source.tar.gz'), '--transform', 's,^,document/,', '--no-recursion', '-C', folder, '--null', '--verbatim-files-from', '-T', join(dir, 'files')])
    await run(process.execPath, [join(PRESMIUM, 'deploy', 'cloud', 'studio', 'share-build.mjs'), join(SPACE, document), join(dir, 'site'), base], { cwd: SPACE, maxBuffer: 64 << 20, timeout: 15 * 60_000 })
    // The build writes each form under <out>/<form>/: the shared site is the web form.
    await run('tar', ['-czf', join(dir, 'site.tar.gz'), '-C', join(dir, 'site', 'web'), '.'])
    await rm(join(dir, 'site'), { recursive: true, force: true })
    snapshots.set(id, dir)
    setTimeout(() => { snapshots.delete(id); void rm(dir, { recursive: true, force: true }) }, 30 * 60_000).unref()
    return { id }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}

/** Removes everything but plain directories and files: a copy brings no links into the workspace. */
async function plain(dir) {
  for (const name of await readdir(dir)) {
    const path = join(dir, name), info = await lstat(path)
    if (info.isDirectory()) await plain(path)
    else if (!info.isFile()) await rm(path, { force: true })
  }
}

const slug = title => title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'copy'

/** The ids of the documents in the workspace (every `index.pmd`), leaving out `except`, git, dependencies and the trash. */
async function documentIds(root, except) {
  const ids = new Set()
  const walk = async (dir, depth) => {
    if (dir === except || depth > 8) return
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const item of entries) {
      if (item.isDirectory() && !['.git', 'node_modules', '.trash', '.presmium', '.deltabox'].includes(item.name)) await walk(join(dir, item.name), depth + 1)
      else if (item.isFile() && item.name === 'index.pmd') {
        try { const id = JSON.parse(await readFile(join(dir, item.name), 'utf8')).id; if (typeof id === 'string') ids.add(id) } catch { /* not a document */ }
      }
    }
  }
  await walk(root, 0)
  return ids
}

/** `document` with its id, and every reference or synced block that points at itself, changed to `next`. */
function renameSelf(document, old, next) {
  const visit = value => {
    if (Array.isArray(value)) return value.map(visit)
    if (value && typeof value === 'object') {
      const out = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item)]))
      if (out.document === old && ('block' in out || 'section' in out || Object.keys(out).length === 1)) out.document = next
      return out
    }
    return value
  }
  return { ...visit(document), id: next }
}

async function importCopy(request, title) {
  await mkdir(SCRATCH, { recursive: true, mode: 0o700 })
  const dir = await mkdtemp(join(SCRATCH, 'import-'))
  try {
    const archive = join(dir, 'source.tar.gz')
    await pipeline(request, createWriteStream(archive, { mode: 0o600 }))
    await mkdir(join(dir, 'files'))
    await run('tar', ['-xzf', archive, '-C', join(dir, 'files'), '--no-same-owner', '--no-same-permissions', '--no-overwrite-dir'])
    const source = join(dir, 'files', 'document')
    await plain(join(dir, 'files'))
    if (!existsSync(join(source, 'index.pmd'))) throw Object.assign(new Error('fork-archive-invalid'), { status: 422 })
    let name = slug(title), n = 1
    while (existsSync(join(SPACE, name))) name = `${slug(title)}-${++n}`
    await rename(source, join(SPACE, name))
    const entry = join(SPACE, name, 'index.pmd')
    let document = JSON.parse(await readFile(entry, 'utf8'))
    let changed = false
    // A shared document may be nested; its parent is not in this workspace, so the copy starts at the top level.
    if (document.placement && document.placement.parent !== null) {
      document.placement = { ...document.placement, parent: null }
      changed = true
    }
    // A copy of a document this workspace already holds (e.g. the author's own share) takes a new id, and its
    // references to itself follow.
    const taken = await documentIds(SPACE, join(SPACE, name))
    if (typeof document.id === 'string' && taken.has(document.id)) {
      const old = document.id
      let n = 2
      while (taken.has(`${old}-${n}`)) n++
      document = renameSelf(document, old, `${old}-${n}`)
      changed = true
    }
    if (changed) await writeFile(entry, `${JSON.stringify(document, null, 2)}\n`)
    await git(['add', '--', name])
    await git(['commit', '-q', '-m', `Fork: ${title.replace(/[\r\n]/g, ' ').slice(0, 200)}`, '--', name])
    const id = document.id
    return { document: name, id: typeof id === 'string' ? id : '' }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const RELAYED = ['accept', 'content-type', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id']

/** External AI assistants reach the workspace service's MCP server through the console and this relay. */
function relayMcp(request, response) {
  const endpoint = service()
  if (!endpoint) return json(response, 503, { error: 'studio-starting' })
  const headers = { authorization: `Bearer ${endpoint.token}` }
  for (const name of RELAYED) if (request.headers[name]) headers[name] = request.headers[name]
  const upstream = httpRequest(endpoint.mcp, { method: request.method, headers }, answer => {
    const passed = {}
    for (const name of ['content-type', 'mcp-session-id', 'cache-control']) if (answer.headers[name]) passed[name] = answer.headers[name]
    response.writeHead(answer.statusCode ?? 502, passed)
    answer.pipe(response)
  })
  upstream.on('error', () => { if (!response.headersSent) json(response, 502, { error: 'studio-mcp-unavailable' }); else response.destroy() })
  request.pipe(upstream)
}

const json = (response, status, body) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)) }

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://control')
    if (url.pathname === '/mcp') return relayMcp(request, response)
    if (request.method === 'GET' && url.pathname === '/status') return json(response, 200, { stage: stage() })
    if (request.method === 'GET' && url.pathname === '/documents') return json(response, 200, { documents: await documents() })
    if (request.method === 'POST' && url.pathname === '/snapshots') return json(response, 201, await snapshot(url.searchParams.get('document') ?? '', url.searchParams.get('base') ?? ''))
    const file = /^\/snapshots\/([a-f0-9]{32})\/(source|site)$/.exec(url.pathname)
    if (file && request.method === 'GET') {
      const dir = snapshots.get(file[1])
      if (!dir) return json(response, 404, { error: 'snapshot-not-found' })
      response.writeHead(200, { 'content-type': 'application/gzip', 'cache-control': 'no-store' })
      return void await pipeline(createReadStream(join(dir, `${file[2]}.tar.gz`)), response)
    }
    if (request.method === 'POST' && url.pathname === '/imports') return json(response, 201, await importCopy(request, url.searchParams.get('title') || 'copy'))
    return json(response, 404, { error: 'not-found' })
  } catch (error) {
    console.error(`presmium cloud control: ${request.method} ${request.url}: ${error instanceof Error ? error.message : String(error)}`)
    if (!response.headersSent) json(response, error?.status ?? 500, { error: error?.status ? error.message : 'failed' })
    else response.destroy()
  }
}).listen(PORT, '127.0.0.1')
