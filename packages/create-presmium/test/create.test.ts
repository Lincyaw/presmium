import { spawn } from 'node:child_process'
import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { stripVTControlCharacters } from 'node:util'
import { run } from '@presmium/cli/testing'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { storedPath, TEMPLATE_SOURCES, templateFiles } from '../src/templates.ts'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const { version: VERSION } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

interface Tarball {
  name: string
  file: string
}

interface Project {
  dir: string
  made: { name: string, scripts: Record<string, string>, dependencies?: Record<string, string>, devDependencies?: Record<string, string>, peerDependencies?: Record<string, string> }
  output: string
}

let work: string
let tarballs: Map<string, string>
const projects: Record<'lecture' | 'workspace' | 'plugin', Project> = {} as never

function userEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env }
  for (const name of Object.keys(env)) if (/^(?:npm|pnpm)_/i.test(name) || ['NODE_ENV', 'INIT_CWD', 'VITEST', 'VITEST_WORKER_ID', 'VITEST_POOL_ID', 'TEST'].includes(name)) delete env[name]
  return { ...env, ...extra }
}

async function sh(command: string, args: string[], cwd: string, input = '', env: Record<string, string> = {}): Promise<string> {
  const child = spawn(command, args, { cwd, env: userEnv(env), stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  child.stdin.end(input)
  const code = await new Promise<number | null>(resolve => child.once('close', resolve))
  if (code !== 0) throw new Error(`${command} ${args.join(' ')} exited (${code}) in ${cwd}:\n${output}`)
  return output
}

async function consumer<T>(name: string, ...args: unknown[]): Promise<T> {
  const script = 'const consumer = await import(process.argv[1]); process.stdout.write(JSON.stringify(await consumer[process.argv[2]](...JSON.parse(process.argv[3])) ?? null))'
  return JSON.parse(await sh(process.execPath, ['--input-type=module', '-e', script, pathToFileURL(join(ROOT, 'scripts/consumer.ts')).href, name, JSON.stringify(args)], ROOT)) as T
}

const createPresmium = () => ['pnpm', `--package=${tarballs.get('create-presmium')}`, 'dlx', 'create-presmium']

async function create(args: string[], input = '', lang = 'zh_CN.UTF-8'): Promise<string> {
  const [command, ...rest] = createPresmium()
  return sh(command!, [...rest, ...args], work, input, { LANG: lang, LC_ALL: '' })
}

async function createInTerminal(input: string): Promise<string> {
  const command = createPresmium().map(word => `'${word}'`).join(' ')
  return sh('script', ['--quiet', '--return', '--command', command, '/dev/null'], work, input, { LANG: 'zh_CN.UTF-8', LC_ALL: '' })
}

async function install(dir: string): Promise<void> {
  const file = join(dir, 'package.json')
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, string> | undefined>
  const spec = (name: string) => `file:${relative(dir, tarballs.get(name)!)}`
  for (const field of ['dependencies', 'devDependencies']) {
    for (const name of Object.keys(pkg[field] ?? {})) if (tarballs.has(name)) pkg[field]![name] = spec(name)
  }
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
  appendFileSync(join(dir, 'pnpm-workspace.yaml'), `overrides:\n${[...tarballs.keys()].map(name => `  '${name}': '${spec(name)}'\n`).join('')}`)
  await sh('pnpm', ['install', '--reporter=append-only'], dir)
}

function presmiumBin(project: string): string {
  const own = join(project, 'node_modules/presmium/bin/presmium.mjs')
  return existsSync(own) ? own : join(project, 'node_modules/@presmium/cli/bin/presmium.mjs')
}

function presmium(project: string, args: string[]) {
  return run(process.execPath, [presmiumBin(project), ...args], { cwd: project, env: userEnv() })
}

function made(dir: string, output: string): Project {
  return { dir, made: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Project['made'], output }
}

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'presmium-create-'))
  await consumer('packAll', join(work, 'tarballs'))
  const index = JSON.parse(readFileSync(join(work, 'tarballs/index.json'), 'utf8')) as Tarball[]
  tarballs = new Map(index.map(tarball => [tarball.name, tarball.file]))
  projects.lecture = made(join(work, 'lecture'), await create([], '1\nlecture\n分词入门 $& $$x$$\n'))
  projects.workspace = made(join(work, 'course'), await create(['course', '--type', 'workspace', '--title', 'Data $& structures $$'], '', 'en_US.UTF-8'))
  projects.plugin = made(join(work, 'greeting'), await createInTerminal('3\ngreeting\n@acme/presmium-greeting\n'))
  await Promise.all(Object.values(projects).map(project => install(project.dir)))
}, 900_000)

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true })
}, 120_000)

it('packs each template as its one source in the repository, file for file', async () => {
  const unpacked = join(work, 'create-presmium')
  mkdirSync(unpacked)
  await sh('tar', ['-xzf', tarballs.get('create-presmium')!, '-C', unpacked], work)
  for (const [name, source] of Object.entries(TEMPLATE_SOURCES)) {
    const from = join(ROOT, source)
    const packed = join(unpacked, 'package/templates', name)
    const files = templateFiles(from)
    expect(templateFiles(packed), source).toEqual(files.map(storedPath).sort())
    for (const path of files) expect(readFileSync(join(packed, storedPath(path))).equals(readFileSync(join(from, path))), `${source}/${path}`).toBe(true)
  }
})

it('asks for what the arguments leave out, in the system\'s language, and writes each project for Presmium at its own version, with its agents\' skills', () => {
  const { lecture, workspace, plugin } = projects
  for (const asked of [lecture, plugin]) expect(asked.output).toContain('新建哪种项目？')
  expect(lecture.output).toContain('已在 lecture 新建讲义。')
  expect(plugin.output).toContain('已在 greeting 新建插件。')
  expect(workspace.output).toContain('Made a workspace in course.')
  expect(readFileSync(join(lecture.dir, 'lecture.md'), 'utf8')).toContain('title: "分词入门 $& $$x$$"')
  expect(readFileSync(join(workspace.dir, 'presmium.workspace.yaml'), 'utf8')).toMatch(/^title: "Data \$& structures \$\$"$/m)
  expect(readFileSync(join(workspace.dir, 'intro/lecture.md'), 'utf8')).toContain('title: "Lecture 1"')
  expect(readFileSync(join(workspace.dir, 'README.md'), 'utf8')).toContain('A Presmium workspace')
  expect(readFileSync(join(plugin.dir, 'src/domain/index.ts'), 'utf8')).toContain('export const PLUGIN_ID = \'acme.presmium-greeting\'')
  const at = (names: string[]) => Object.fromEntries(names.map(name => [name, `^${VERSION}`]))
  for (const made of [lecture, workspace]) expect(made.made.devDependencies).toEqual(at(['presmium']))
  expect(lecture.output).toMatch(/^ {2}presmium dev$/m)
  expect(plugin.made).toMatchObject({ name: '@acme/presmium-greeting', devDependencies: at(['@presmium/cli', '@presmium/web', '@presmium/render-slides', '@presmium/render-notebook', '@presmium/slidev-addon-core']), peerDependencies: at(['@presmium/compiler', '@presmium/host', '@presmium/kernel', '@presmium/viewer']) })
  for (const [kind, skills] of [['lecture', ['presmium-author', 'presmium-present']], ['workspace', ['presmium-author', 'presmium-present']], ['plugin', ['presmium-author', 'presmium-develop']]] as const) {
    const { dir } = projects[kind]
    for (const skill of skills) expect(readFileSync(join(dir, '.agents/skills', skill, 'SKILL.md'), 'utf8')).toContain(`name: ${skill}`)
    expect(readlinkSync(join(dir, '.claude/skills'))).toBe('../.agents/skills')
    expect(readlinkSync(join(dir, 'CLAUDE.md'))).toBe('AGENTS.md')
    expect(existsSync(join(dir, '.gitignore')), kind).toBe(true)
    expect(lstatSync(join(dir, '.git')).isDirectory(), kind).toBe(true)
  }
})

it('makes a lecture that checks with no problems and builds its web page, slides and notebook', async () => {
  const { dir } = projects.lecture
  const check = await presmium(dir, ['check'])
  expect(check.code, check.stdout + check.stderr).toBe(0)
  expect(check.stdout).toContain('no problems')
  const build = await presmium(dir, ['build'])
  expect(build.code, build.stdout + build.stderr).toBe(0)
  expect(build.stdout).toContain('0 errors, 0 warnings')
  for (const file of ['web/index.html', 'slides/index.html', 'notebook/lecture.ipynb']) expect(existsSync(join(dir, 'dist', file)), file).toBe(true)
}, 600_000)

it('makes a workspace whose document checks with no problems, whose site builds, and which presmium serve serves', async () => {
  const { dir } = projects.workspace
  const check = await presmium(dir, ['check', 'intro'])
  expect(check.code, check.stdout + check.stderr).toBe(0)
  expect(check.stdout).toContain('no problems')
  const build = await presmium(dir, ['build'])
  expect(build.code, build.stdout + build.stderr).toBe(0)
  expect(build.stdout).toContain('document  intro  Lecture 1')
  expect(build.stdout).toContain('no problems')
  expect(existsSync(join(dir, 'dist/web/index.html'))).toBe(true)
  const cache = mkdtempSync(join(tmpdir(), 'presmium-create-cache-'))
  const serve = spawn(process.execPath, [presmiumBin(dir), 'serve', '--port', '0'], { cwd: dir, env: userEnv({ XDG_CACHE_HOME: cache }), stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = new Promise(resolve => serve.once('exit', resolve))
  try {
    let output = ''
    await new Promise<void>((resolve, reject) => {
      const read = (chunk: Buffer) => {
        output += chunk
        if (/^mcp {2}/m.test(output)) resolve()
      }
      serve.stdout.on('data', read)
      serve.stderr.on('data', read)
      serve.once('exit', code => reject(new Error(`presmium serve exited (${code}):\n${output}`)))
    })
    const url = /^serve {2}(http:\/\/\S+)$/m.exec(output)?.[1]
    for (const path of ['/', '/intro/']) {
      const page = await fetch(`${url}${path}`)
      expect(page.status, path).toBe(200)
      expect(await page.text(), path).toContain('id="app"')
    }
  } finally {
    serve.kill('SIGTERM')
    await exited
    rmSync(cache, { recursive: true, force: true })
  }
}, 600_000)

it('makes a plugin whose example checks with no problems and builds, and whose integration tests pass', async () => {
  const { dir } = projects.plugin
  const check = await presmium(dir, ['check', 'example'])
  expect(check.code, check.stdout + check.stderr).toBe(0)
  expect(check.stdout).toContain('no problems')
  const build = await presmium(dir, ['build', 'example'])
  expect(build.code, build.stdout + build.stderr).toBe(0)
  expect(build.stdout).toContain('0 errors, 0 warnings')
  for (const file of ['web/index.html', 'slides/index.html', 'notebook/lecture.ipynb']) expect(existsSync(join(dir, 'example/dist', file)), file).toBe(true)
  const tests = stripVTControlCharacters(await sh('pnpm', ['test'], dir))
  expect(tests).toMatch(/Tests {2}3 passed \(3\)/)
}, 600_000)
