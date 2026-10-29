// The entry of one Presmium Cloud Studio container: the owner's workspace on the persistent volume /work, the
// complete Presmium Studio over it, and a small control service for the cloud (readiness, documents, share
// snapshots, fork imports). Every file operation on the workspace runs here, as the owner's unprivileged user.
import { execFile, spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'

const run = promisify(execFile)
const PRESMIUM = '/opt/presmium'
const WORK = '/work'
const SPACE = join(WORK, 'space')
const SCRATCH = join(WORK, 'cache', 'cloud')
const STUDIO_PORT = 3080
const CONTROL_PORT = 3090

const control = process.env.PRESMIUM_CLOUD_CONTROL_TOKEN ?? ''
const publicUrl = process.env.PRESMIUM_CLOUD_PUBLIC_URL ?? ''
const previewUrl = process.env.PRESMIUM_CLOUD_PREVIEW_URL ?? ''
if (!/^[A-Za-z0-9_-]{43}$/.test(control) || !/^https?:\/\//.test(publicUrl) || !/^https?:\/\//.test(previewUrl)) {
  console.error('presmium cloud studio: PRESMIUM_CLOUD_CONTROL_TOKEN, PRESMIUM_CLOUD_PUBLIC_URL and PRESMIUM_CLOUD_PREVIEW_URL are required')
  process.exit(2)
}

// The cloud's settings stay with this process; Studio, its agents and the documents' code never see them.
const env = { ...process.env, HOME: join(WORK, 'home'), XDG_STATE_HOME: join(WORK, 'state'), XDG_CACHE_HOME: join(WORK, 'cache'), XDG_CONFIG_HOME: join(WORK, 'config') }
for (const name of Object.keys(env)) if (name.startsWith('PRESMIUM_CLOUD_')) delete env[name]

const address = Object.values(networkInterfaces()).flat().find(entry => entry && entry.family === 'IPv4' && !entry.internal)?.address
if (!address) {
  console.error('presmium cloud studio: no network address')
  process.exit(2)
}

const git = (args, options = {}) => run('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'commit.gpgSign=false', ...args], { cwd: SPACE, env, maxBuffer: 64 << 20, ...options })

async function prepare() {
  for (const dir of ['home', 'state', 'cache', 'config']) await mkdir(join(WORK, dir), { recursive: true, mode: 0o700 })
  const identity = join(WORK, 'home', '.gitconfig')
  if (!existsSync(identity)) {
    const name = (process.env.PRESMIUM_CLOUD_USER_NAME || 'Presmium').replace(/[\r\n]/g, ' ').slice(0, 200)
    const email = (process.env.PRESMIUM_CLOUD_USER_EMAIL || 'author@presmium.invalid').replace(/[\r\n\s]/g, '').slice(0, 200)
    await writeFile(identity, `[user]\n\tname = ${name}\n\temail = ${email}\n[init]\n\tdefaultBranch = main\n`, { mode: 0o600 })
  }
  // A new space starts as the example workspace, as a first local `pnpm studio` does.
  if (!existsSync(SPACE) || readdirSync(SPACE).length === 0) {
    await run(process.execPath, [join(PRESMIUM, 'examples', 'animations', 'try.mjs'), SPACE], { env })
  }
  await rm(SCRATCH, { recursive: true, force: true })
  await mkdir(SCRATCH, { recursive: true, mode: 0o700 })
}

let launchToken
function startStudio() {
  const child = spawn(process.execPath, [join(PRESMIUM, 'packages', 'studio', 'bin', 'presmium-studio.mjs'), SPACE, '--host', address, '--port', String(STUDIO_PORT), '--public-url', publicUrl, '--preview-url', previewUrl], { env, stdio: ['ignore', 'pipe', 'inherit'] })
  let rest = ''
  child.stdout.on('data', chunk => {
    process.stdout.write(chunk)
    const lines = (rest + chunk).split('\n')
    rest = lines.pop()
    for (const line of lines) {
      const printed = /^studio\s+(\S+)/.exec(line)?.[1]
      if (printed) launchToken = new URL(printed).searchParams.get('token') ?? undefined
    }
  })
  const stop = signal => child.kill(signal)
  process.once('SIGTERM', () => stop('SIGTERM'))
  process.once('SIGINT', () => stop('SIGINT'))
  // The container lives exactly as long as Studio: the cloud sees a stopped container as a stopped Studio.
  child.once('exit', code => process.exit(code ?? 1))
}

/** The workspace service's MCP endpoint and token, from the state file it writes (0600) under the cache home. */
function mcp() {
  const root = join(WORK, 'cache', 'presmium', 'serve')
  const files = existsSync(root) ? readdirSync(root).map(dir => join(root, dir, 'server.json')).filter(file => existsSync(file)) : []
  const newest = files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  if (!newest) return undefined
  const state = JSON.parse(readFileSync(newest, 'utf8'))
  return typeof state.url === 'string' && typeof state.mcp === 'string' && typeof state.token === 'string' ? { serve: state.url, url: state.mcp, token: state.token } : undefined
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
  await mkdir(dir, { mode: 0o700 })
  try {
    await git(['archive', '--format=tar.gz', `--prefix=document/`, '-o', join(dir, 'source.tar.gz'), `HEAD:${document}`])
    await run(process.execPath, [join(PRESMIUM, 'deploy', 'cloud', 'studio', 'share-build.mjs'), join(SPACE, document), join(dir, 'site'), base], { env, cwd: SPACE, maxBuffer: 64 << 20, timeout: 15 * 60_000 })
    // The build writes each form under <out>/<form>/: the shared site is the web form.
    await run('tar', ['-czf', join(dir, 'site.tar.gz'), '-C', join(dir, 'site', 'web'), '.'], { env })
    await rm(join(dir, 'site'), { recursive: true, force: true })
    snapshots.set(id, dir)
    setTimeout(() => { snapshots.delete(id); void rm(dir, { recursive: true, force: true }) }, 30 * 60_000).unref()
    return { id }
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}

/** Removes everything but plain directories and files: a fork brings no links into the workspace. */
async function plain(dir) {
  for (const name of await readdir(dir)) {
    const path = join(dir, name), info = await lstat(path)
    if (info.isDirectory()) await plain(path)
    else if (!info.isFile()) await rm(path, { force: true })
  }
}

const slug = title => title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'fork'

async function importFork(request, title) {
  const dir = await mkdtemp(join(SCRATCH, 'import-'))
  try {
    const archive = join(dir, 'source.tar.gz')
    await pipeline(request, createWriteStream(archive, { mode: 0o600 }))
    await mkdir(join(dir, 'files'))
    await run('tar', ['-xzf', archive, '-C', join(dir, 'files'), '--no-same-owner', '--no-same-permissions', '--no-overwrite-dir'], { env })
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

function authorized(request) {
  const given = Buffer.from(request.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${control}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

const json = (response, status, body) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)) }

function controlService() {
  createServer(async (request, response) => {
    try {
      if (!authorized(request)) return json(response, 401, { error: 'unauthorized' })
      const url = new URL(request.url ?? '/', 'http://control')
      if (request.method === 'GET' && url.pathname === '/ready') {
        const endpoint = mcp()
        return launchToken && endpoint ? json(response, 200, { token: launchToken, serve: endpoint.serve, mcp: { url: endpoint.url, token: endpoint.token } }) : json(response, 503, { error: 'starting' })
      }
      if (request.method === 'GET' && url.pathname === '/documents') return json(response, 200, { documents: await documents() })
      if (request.method === 'POST' && url.pathname === '/snapshots') {
        return json(response, 201, await snapshot(url.searchParams.get('document') ?? '', url.searchParams.get('base') ?? ''))
      }
      const file = /^\/snapshots\/([a-f0-9]{32})\/(source|site)$/.exec(url.pathname)
      if (file && request.method === 'GET') {
        const dir = snapshots.get(file[1])
        if (!dir) return json(response, 404, { error: 'snapshot-not-found' })
        response.writeHead(200, { 'content-type': 'application/gzip', 'cache-control': 'no-store' })
        return void await pipeline(createReadStream(join(dir, `${file[2]}.tar.gz`)), response)
      }
      if (request.method === 'POST' && url.pathname === '/imports') return json(response, 201, await importFork(request, url.searchParams.get('title') || 'fork'))
      return json(response, 404, { error: 'not-found' })
    } catch (error) {
      console.error(`presmium cloud studio: ${request.method} ${request.url}: ${error instanceof Error ? error.message : String(error)}`)
      if (!response.headersSent) json(response, error?.status ?? 500, { error: error?.status ? error.message : 'failed' })
      else response.destroy()
    }
  }).listen(CONTROL_PORT, address)
}

await prepare()
controlService()
startStudio()
