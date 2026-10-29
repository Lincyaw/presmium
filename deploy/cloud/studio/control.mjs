// The cloud's control service inside one user's Studio container, on 127.0.0.1 only. The single-user server proxies
// it at /user/<name>/cloud/ after JupyterHub has authenticated the request (the owner, or the console's service
// token), so it has no credential of its own. Every file operation runs here, as the owner's unprivileged user.
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PRESMIUM = '/opt/presmium'
const SPACE = '/work/space'
const SCRATCH = join('/work', 'cache', 'cloud')
const PORT = Number(process.argv[2] ?? 18997)

const git = (args, options = {}) => run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args], { cwd: SPACE, maxBuffer: 64 << 20, ...options })

/** The workspace service's MCP endpoint and token, from the state file it writes (0600) under the cache home. */
function mcp() {
  const root = join(process.env.XDG_CACHE_HOME ?? '/work/cache', 'presmium', 'serve')
  const files = existsSync(root) ? readdirSync(root).map(dir => join(root, dir, 'server.json')).filter(file => existsSync(file)) : []
  const newest = files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  if (!newest) return undefined
  const state = JSON.parse(readFileSync(newest, 'utf8'))
  return typeof state.mcp === 'string' && typeof state.token === 'string' ? { url: state.mcp, token: state.token } : undefined
}

async function documents() {
  const { stdout } = await git(['ls-files', '-z', '--', '*/lecture.json'])
  const found = []
  for (const file of stdout.split('\0').filter(Boolean)) {
    const dir = file.slice(0, -'/lecture.json'.length)
    if (dir.includes('/')) continue
    let title = dir, id = ''
    try {
      const lecture = JSON.parse(await readFile(join(SPACE, file), 'utf8'))
      title = lecture.metadata?.title || dir
      id = typeof lecture.id === 'string' ? lecture.id : ''
    } catch {}
    found.push({ document: dir, id, title: String(title).slice(0, 200) })
  }
  return found
}

const DOCUMENT = /^[^/\\\0.][^/\\\0]{0,199}$/
const snapshots = new Map()

/** A shared document as it is committed now: its source archive, and its web site built for `base`. */
async function snapshot(document, base) {
  if (!DOCUMENT.test(document) || !existsSync(join(SPACE, document, 'lecture.json'))) throw Object.assign(new Error('document-not-found'), { status: 404 })
  if (!/^\/[A-Za-z0-9/_-]+\/$/.test(base)) throw Object.assign(new Error('share-base-invalid'), { status: 400 })
  const id = randomBytes(16).toString('hex'), dir = join(SCRATCH, id)
  await mkdir(dir, { recursive: true, mode: 0o700 })
  try {
    await git(['archive', '--format=tar.gz', '--prefix=document/', '-o', join(dir, 'source.tar.gz'), `HEAD:${document}`])
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
    if (!existsSync(join(source, 'lecture.json'))) throw Object.assign(new Error('fork-archive-invalid'), { status: 422 })
    let name = slug(title), n = 1
    while (existsSync(join(SPACE, name))) name = `${slug(title)}-${++n}`
    await rename(source, join(SPACE, name))
    await git(['add', '--', name])
    await git(['commit', '-q', '-m', `Fork: ${title.replace(/[\r\n]/g, ' ').slice(0, 200)}`, '--', name])
    const id = JSON.parse(await readFile(join(SPACE, name, 'lecture.json'), 'utf8')).id
    return { document: name, id: typeof id === 'string' ? id : '' }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

const RELAYED = ['accept', 'content-type', 'mcp-session-id', 'mcp-protocol-version', 'last-event-id']

/** External AI assistants reach the workspace service's MCP server through the console and this relay. */
function relayMcp(request, response) {
  const endpoint = mcp()
  if (!endpoint) return json(response, 503, { error: 'studio-starting' })
  const headers = { authorization: `Bearer ${endpoint.token}` }
  for (const name of RELAYED) if (request.headers[name]) headers[name] = request.headers[name]
  const upstream = httpRequest(endpoint.url, { method: request.method, headers }, answer => {
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
