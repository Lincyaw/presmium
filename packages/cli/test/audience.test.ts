// Audiences (WP-87, P-55, docs/ir.md 2.11): `presmium build --audience student` leaves the teacher's blocks and
// sections out of every output, the directives nested in another's body or a list and an `{include}` with
// `:audience:` among them, and scans what it wrote for their sentences; `presmium check --audience student` checks
// the student version; in `presmium serve` (SHARED) readers see the student view: their pages, the IR module the
// pages load, the search index and what a `tutor` MCP token reads, while editors see the whole deck.
// WP-81e2: a deck's translations are compiled for the audience too, without a temporary file in the deck, and
// scanned; `{audience}` without names fails closed; a student build keeps no finding of what it left out; content
// after an `{include}` with `:audience:` that opens a section is a warning; agent-host builds the student view, as
// `build`'s `audience` option does for presmium dev and serve (LOCAL); `presmium build --audience` scans the whole
// output directory; serve (LOCAL) says the workspace site leaves a translation out.
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build, Compiler } from '@presmium/compiler'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { presmium } from './helpers.ts'
import type { SharedSetup } from './serve-helpers.ts'
import { cleanEnv, FIXTURES, presmiumProcess, raw, remove, ROOT, shared, waitFor, workspace } from './serve-helpers.ts'

const DECK = join(ROOT, 'e2e/fixtures/publish-checks/audience')
/** A Chinese deck and its English translation, each with a teacher's block and a teacher's section. */
const TRANSLATED = join(ROOT, 'e2e/fixtures/publish-checks/translated')
/** What only the teacher's content of the two languages holds (lowercase, as the search index keeps it). */
const TEACHER_BOTH = ['teacherzh41', 'guidezh52', 'teacheren41', 'guideen52']
/** What only the teacher's blocks and section hold (lowercase: the search index keeps its terms so). */
const TEACHER = ['teacheronly42', 'guideonly17', 'answerkey99', 'demotips', '演示合并之前先断开网络', '这一节整节只给教师']
/** What only the teacher's nested directives (a tab, a tip in a note, a card, code in a list item) and included file hold. */
const NESTED = ['tabkey31', 'tipkey58', 'cardkey64', 'listkey72', 'includekey85', 'handbook23', '助教手册']

/** A copy of the deck in examples/demo/.presmium, where its plugins, Slidev and VitePress resolve. */
function deck(source = DECK): string {
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'audience-'))
  cpSync(source, dir, { recursive: true })
  writeFileSync(join(dir, '.gitignore'), '*\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  return dir
}

/** The files under `dir` (relative) whose text, lowercased, holds `text`. */
function holding(dir: string, text: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) => {
    try {
      return readFileSync(join(dir, file), 'utf8').toLowerCase().includes(text)
    } catch {
      return false
    }
  })
}

describe('presmium build --audience student', () => {
  const dirs: string[] = []
  afterAll(() => dirs.forEach(remove))

  it('writes no sentence of the teacher\'s content to the pages, the search index, the slides, the notebook or ir.json', async () => {
    const dir = deck()
    dirs.push(dir)
    const built = await presmium(dir, ['build', '--audience', 'student', '--out', 'student'])
    expect(built.code, built.stdout + built.stderr).toBe(0)
    const out = join(dir, 'student')
    for (const text of [...TEACHER, ...NESTED]) expect(holding(out, text), text).toEqual([])
    // The nested teacher's content is in the whole deck: it is the audience that leaves it out.
    const full = await presmium(dir, ['ir'])
    for (const text of NESTED) expect(full.stdout.toLowerCase(), text).toContain(text)
    // The student's content is there, in each output: so the search above reads them.
    const student = holding(out, 'studentvisible')
    for (const output of [/^ir\.json$/, /^web\/.*\.html$/, /^web\/assets\/chunks\/@localSearchIndexroot\.\w+\.js$/, /^slides\/assets\/.*\.js$/, /^notebook\/.*\.ipynb$/]) {
      expect(student.some(file => output.test(file)), String(output)).toBe(true)
    }
    // The teacher's section is in neither the web form's contents nor the slides; the others are numbered again.
    const { sections } = JSON.parse(readFileSync(join(out, 'ir.json'), 'utf8')) as { sections: { title: string, index: number }[] }
    expect(sections.map(s => [s.index, s.title])).toEqual([[1, '受众测试'], [2, '合并规则'], [3, '练习']])
  }, 300_000)

  it('fails when a sentence of a teacher\'s block reaches the build through a code block\'s output, at that block', async () => {
    const dir = deck()
    dirs.push(dir)
    appendFileSync(join(dir, 'lecture.md'), '\n```{code} python\n:run:\nprint("这一段只给教师看：演示合并之前先断开网络，" + "口令 TEACHERONLY42。")\n```\n')
    const built = await presmium(dir, ['build', '--audience', 'student', '--to', 'notebook', '--out', 'student'])
    expect(built.code).toBe(1)
    const line = readFileSync(join(dir, 'lecture.md'), 'utf8').split('\n').findIndex(text => text.includes('TEACHERONLY42')) + 1
    expect(built.stdout).toMatch(new RegExp(`^lecture\\.md:${line} {2}error {2}content only for teacher is in the build for student: "[^"]*TEACHERONLY42" in [^ ]+ {2}\\(presmium\\.audience\\)$`, 'm'))
  }, 300_000)

  it('fails when the output directory holds a build of the whole deck: every file of it is scanned, not only what the build wrote', async () => {
    const dir = deck()
    dirs.push(dir)
    const full = await presmium(dir, ['build', '--to', 'notebook', '--out', 'out'])
    expect(full.code, full.stdout + full.stderr).toBe(0)
    const built = await presmium(dir, ['build', '--audience', 'student', '--to', 'web', '--out', 'out'])
    expect(built.code, built.stdout).toBe(1)
    expect(built.stdout).toMatch(/ error {2}content only for teacher is in the build for student: "[^"]+" in notebook\/lecture\.ipynb {2}\(presmium\.audience\)$/m)
  }, 300_000)

  it('checks the student version with presmium check --audience student: a broken link only the teacher sees is not reported', async () => {
    const dir = deck()
    dirs.push(dir)
    appendFileSync(join(dir, 'lecture.md'), '\n:::{only} web\n:audience: teacher\n教师的 [评分表](grading/missing.csv)。\n:::\n')
    const links = async (args: string[]) => {
      const checked = await presmium(dir, ['check', '--json', ...args])
      return (JSON.parse(checked.stdout) as { findings: { checkId: string, message: string }[] }).findings.filter(f => f.checkId === 'presmium.links').map(f => f.message)
    }
    expect(await links([])).toEqual([expect.stringContaining('grading/missing.csv: no such file')])
    expect(await links(['--audience', 'student'])).toEqual([])
  }, 120_000)
})

/** A JSON-RPC request to MCP (Streamable HTTP) with a bearer token; the result, whether answered as JSON or as an event. */
async function mcp(url: string, host: string, token: string, method: string, params: Record<string, unknown>): Promise<Record<string, any>> {
  const answer = await raw(`${url}/mcp`, {
    headers: { 'Host': host, 'Authorization': `Bearer ${token}`, 'Accept': 'application/json, text/event-stream' },
    json: { jsonrpc: '2.0', id: 1, method, params },
  })
  expect(answer.status, answer.text).toBe(200)
  const data = answer.text.trimStart().startsWith('{') ? answer.text : answer.text.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('')
  return JSON.parse(data) as Record<string, any>
}

describe('presmium serve with a login proxy (SHARED): readers see the student view', () => {
  let dir: string
  let setup: SharedSetup
  beforeAll(async () => {
    dir = workspace('audience', 'audience')
    cpSync(join(FIXTURES, 'plugins/presmium-fixture-tutor'), join(dir, 'node_modules/presmium-fixture-tutor'), { recursive: true })
    setup = await shared(dir)
  }, 180_000)
  afterAll(async () => {
    await setup?.stop()
    remove(dir)
  }, 60_000)

  it('gives a reader\'s page, IR module and search index no teacher\'s sentence, an editor\'s all; a reader\'s tutor token reads the student view', async () => {
    const reader = setup.as('reader@test')
    const editor = setup.as('editor@test')
    const page = await raw(`${setup.url}/course/`, { headers: reader })
    expect(page.status).toBe(200)
    // The module of the IR the page loads (`virtual:presmium/ir`), and the search index, as the reader's browser asks for them.
    const module = await raw(`${setup.url}/course/@id/__x00__virtual:presmium/ir`, { headers: reader })
    expect(module.status, module.text).toBe(200)
    expect(module.text).toContain('STUDENTVISIBLE')
    const index = await raw(`${setup.url}/course/@localSearchIndexroot`, { headers: reader })
    expect(index.status, index.text).toBe(200)
    expect(index.text.toLowerCase()).toContain('studentvisible')
    // The nested tip too; and a student's {ref} to the teacher's section does not take its title ("现场演示要点 DEMOTIPS").
    for (const text of [...TEACHER, 'tipkey58']) {
      for (const answer of [page, module, index]) expect(answer.text.toLowerCase(), text).not.toContain(text)
    }
    // The editor's page is the same shell; what it shows, its IR module and search index, holds the teacher's content.
    const full = await raw(`${setup.url}/course/@id/__x00__virtual:presmium/ir`, { headers: editor })
    for (const text of ['TEACHERONLY42', 'GUIDEONLY17', 'TIPKEY58']) expect(full.text).toContain(text)
    const editorIndex = await raw(`${setup.url}/course/@localSearchIndexroot`, { headers: editor })
    expect(editorIndex.status, editorIndex.text).toBe(200)
    for (const text of ['teacheronly42', 'guideonly17']) expect(editorIndex.text.toLowerCase()).toContain(text)

    // The tutor token the test plugin's route issues for the reader (`MCP_ENDPOINT.issue(member, 'tutor')`).
    const grant = await raw(`${setup.url}/__presmium/fixture.tutor/tutor`, { headers: { ...reader, 'Presmium-Document': 'course' } })
    expect(grant.status, grant.text).toBe(200)
    const { token } = grant.json<{ token: string }>()
    const host = reader.Host!
    await mcp(setup.url, host, token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'presmium-test', version: '0.1.0' } })
    const section = await mcp(setup.url, host, token, 'tools/call', { name: 'get_section', arguments: { document: 'course', section: 'merge' } })
    const text = JSON.stringify(section.result)
    expect(text).toContain('STUDENTVISIBLE')
    expect(text).not.toContain('TEACHERONLY42')
  }, 300_000)
})

describe('a deck with a translation, for an audience', () => {
  const dirs: string[] = []
  afterAll(() => dirs.forEach(remove))

  it('builds neither language with the teacher\'s content, and compiles the translation without writing a file in the deck', async () => {
    const dir = deck(TRANSLATED)
    dirs.push(dir)
    // Every name written in the deck directory while it builds.
    const written: string[] = []
    const watcher = watch(dir, (_event, name) => name && written.push(name))
    const built = await presmium(dir, ['build', '--audience', 'student', '--out', 'student'])
    watcher.close()
    expect(built.code, built.stdout + built.stderr).toBe(0)
    const out = join(dir, 'student')
    for (const text of TEACHER_BOTH) expect(holding(out, text), text).toEqual([])
    // Both languages are built: the English pages under /en/ with the English student's content.
    expect(holding(join(out, 'web/en'), 'studenten').length).toBeGreaterThan(0)
    expect(holding(join(out, 'web'), 'studentzh').length).toBeGreaterThan(0)
    expect(written.filter(name => name.startsWith('.presmium-translation'))).toEqual([])
    expect(new Set(written)).toEqual(new Set(['student', '.presmium', 'node_modules']))
  }, 300_000)

  it('builds the student view of a whole compilation as presmium dev and serve (LOCAL) do: neither language with the teacher\'s content; a leak is reported without its sentence', async () => {
    const dir = deck(TRANSLATED)
    dirs.push(dir)
    appendFileSync(join(dir, 'lecture.en.md'), '\n```{code} python\n:run:\nprint("Note for teachers: unplug the network before the demo, " + "password TEACHEREN41.")\n```\n')
    // `ServerHost.build` with `view: 'student'`: the compilation of the whole deck, built for the audience.
    const compilation = await new Compiler(join(dir, 'lecture.md'), { bundled: join(ROOT, 'packages/cli') }).compile()
    const out = join(dir, 'dist')
    const report = await build(compilation, { outDir: out, to: ['web'], audience: 'student', quote: false, scan: 'written' })
    for (const text of ['teacherzh41', 'guidezh52', 'guideen52']) expect(holding(out, text), text).toEqual([])
    expect(holding(join(out, 'web/en'), 'studenten').length).toBeGreaterThan(0)
    const leaks = report.findings.filter(f => f.checkId === 'presmium.audience')
    expect(leaks).toEqual([expect.objectContaining({ severity: 'error', message: expect.stringMatching(/^content only for teacher is in the build for student: in web\/\S+$/) })])
    expect(leaks[0]!.source!.file).toBe(join(dir, 'lecture.en.md'))
  }, 300_000)

  it('scans the translation\'s output too: a teacher\'s sentence a code block of the translation prints is an error at its block', async () => {
    const dir = deck(TRANSLATED)
    dirs.push(dir)
    appendFileSync(join(dir, 'lecture.en.md'), '\n```{code} python\n:run:\nprint("Note for teachers: unplug the network before the demo, " + "password TEACHEREN41.")\n```\n')
    const built = await presmium(dir, ['build', '--audience', 'student', '--to', 'web', '--out', 'student'])
    expect(built.code).toBe(1)
    const line = readFileSync(join(dir, 'lecture.en.md'), 'utf8').split('\n').findIndex(text => text.startsWith('Note for teachers')) + 1
    expect(built.stdout).toMatch(new RegExp(`^lecture\\.en\\.md:${line} {2}error {2}content only for teacher is in the build for student: "Note for teachers: [^"]*TEACHEREN41\\." in web/[^ ]+ {2}\\(presmium\\.audience\\)$`, 'm'))
  }, 300_000)
})

describe('the edges of audiences', () => {
  const dirs: string[] = []
  afterAll(() => dirs.forEach(remove))

  it('{audience} without names leaves its section out with an error; the student build keeps no finding of what it left out (an {include} with :audience: that failed, a nested directive), only their number; content for everyone after an {include} that opens a teacher\'s section is a warning', async () => {
    const dir = deck(join(ROOT, 'e2e/fixtures/publish-checks/audience-edges'))
    dirs.push(dir)
    const lines = readFileSync(join(dir, 'lecture.md'), 'utf8').split('\n')
    const at = (text: string) => lines.findIndex(line => line.includes(text)) + 1
    const checked = await presmium(dir, ['check', '--json'])
    const findings = (JSON.parse(checked.stdout) as { findings: { checkId: string, severity: string, message: string, source: { line: number } }[] }).findings
    expect(findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'presmium.directive', severity: 'error', message: expect.stringContaining('{audience}: needs the audiences'), source: expect.objectContaining({ line: at(':::{audience}') }) }),
      expect.objectContaining({ checkId: 'presmium.audience', severity: 'warning', message: expect.stringContaining('follows an {include} with :audience:'), source: expect.objectContaining({ line: at('AFTERKEY74') }) }),
      expect.objectContaining({ message: expect.stringContaining('{secretrole}') }),
      expect.objectContaining({ message: expect.stringContaining('solutions-final-exam.md') }),
      expect.objectContaining({ message: expect.stringContaining('secret-answers.md'), source: expect.objectContaining({ line: at('{include} instructor/secret-answers.md') }) }),
      expect.objectContaining({ message: expect.stringContaining('{hiddenrole}'), source: expect.objectContaining({ line: at('HIDDENTIP36') }) }),
    ]))
    // Only the content for everyone after it is: the {only} for the teacher alone is the teacher's section's.
    expect(findings.filter(f => f.message.includes('follows an {include}'))).toHaveLength(1)

    const built = await presmium(dir, ['build', '--audience', 'student', '--to', 'web', '--out', 'student'])
    expect(built.code).toBe(1)
    const out = join(dir, 'student')
    for (const text of ['nonamekey63', 'partkey85', 'secretrole', 'solutions-final-exam', 'secret-answers', 'hiddenrole', 'hiddentip36', 'onlykey29']) expect(holding(out, text), text).toEqual([])
    expect(holding(out, 'publictext').length).toBeGreaterThan(0)
    const { diagnostics } = JSON.parse(readFileSync(join(out, 'ir.json'), 'utf8')) as { diagnostics: { checkId: string, message: string }[] }
    expect(diagnostics).toEqual([expect.objectContaining({ checkId: 'presmium.audience', message: expect.stringMatching(/^6 findings are in the content left out for student/) })])
  }, 300_000)
})

describe('presmium serve on this machine (LOCAL): a document with a translation', () => {
  let dir: string | undefined
  afterAll(() => remove(dir))

  it('says in the diagnostics that the workspace site leaves the translation out', async () => {
    dir = workspace('translated-local', 'translated', { '@presmium/slidev-addon-exec': 'packages/addon-exec', '@presmium/web': 'packages/web' })
    cpSync(TRANSLATED, join(dir, 'course'), { recursive: true })
    // The test plugin's route issues an MCP token (a `tutor` one: the student view) to read the diagnostics with.
    cpSync(join(FIXTURES, 'plugins/presmium-fixture-tutor'), join(dir, 'node_modules/presmium-fixture-tutor'), { recursive: true })
    const config = join(dir, 'presmium.workspace.yaml')
    writeFileSync(config, readFileSync(config, 'utf8').replace('\'@presmium/web\']', '\'@presmium/web\', presmium-fixture-tutor]'))
    const entry = join(dir, 'course/lecture.md')
    writeFileSync(entry, readFileSync(entry, 'utf8').replace('plugins:\n', 'plugins:\n  - presmium-fixture-tutor\n'))
    const local = presmiumProcess(dir, ['serve', '--port', '0'])
    try {
      const url = (await waitFor(local, /^serve {2}(http:\/\/127\.0\.0\.1:\d+)$/m))[1]!
      const grant = await raw(`${url}/__presmium/fixture.tutor/tutor`, { headers: { 'Presmium-Document': 'course' } })
      expect(grant.status, grant.text).toBe(200)
      const { token } = grant.json<{ token: string }>()
      const host = new URL(url).host
      await mcp(url, host, token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'presmium-test', version: '0.1.0' } })
      const answer = await mcp(url, host, token, 'tools/call', { name: 'get_diagnostics', arguments: { document: 'course' } })
      const { diagnostics } = JSON.parse((answer.result as { content: { text: string }[] }).content[0]!.text) as { diagnostics: { severity: string, check: string, message: string }[] }
      expect(diagnostics).toContainEqual(expect.objectContaining({ severity: 'warning', check: 'presmium.translations', message: expect.stringContaining('translation "en" (lecture.en.md) is not in the workspace site') }))
    } finally {
      await local.stop()
    }
  }, 300_000)
})

describe('presmium agent-host builds the student view of a document (SHARED ServerHost.build)', () => {
  let dir: string | undefined
  afterAll(() => remove(dir))

  it('leaves the teacher\'s content out of both languages of the build', async () => {
    dir = workspace('translated', 'translated', { '@presmium/slidev-addon-exec': 'packages/addon-exec', '@presmium/web': 'packages/web' })
    cpSync(TRANSLATED, join(dir, 'course'), { recursive: true })
    const token = `agent-host-${Math.random().toString(36).slice(2, 10)}`
    const host = presmiumProcess(dir, ['agent-host', '--port', '0'], cleanEnv({ PRESMIUM_AGENT_HOST_TOKEN: token }))
    try {
      const url = (await waitFor(host, /^agent-host {2}(http\S+)$/m))[1]!
      const built = await raw(`${url}/v1/documents/course/build`, { headers: { Authorization: `Bearer ${token}` }, json: { view: 'student', to: ['web'], run: 'none' } })
      expect(built.status, built.text).toBe(200)
      expect(built.json<{ outputs: { renderer: string }[] }>().outputs.map(o => o.renderer), built.text).toEqual(['web'])
      const out = join(dir, 'course/dist')
      for (const text of TEACHER_BOTH) expect(holding(out, text), text).toEqual([])
      expect(holding(join(out, 'web/en'), 'studenten').length).toBeGreaterThan(0)
    } finally {
      await host.stop()
    }
  }, 300_000)
})
