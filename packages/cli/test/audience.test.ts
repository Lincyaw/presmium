import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, watch, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { build, Compiler } from '@lincyaw/compiler'
import { afterAll, describe, expect, it } from 'vitest'
import { presmium } from './helpers.ts'
import { FIXTURES, presmiumProcess, raw, remove, ROOT, waitFor, workspace } from './serve-helpers.ts'

const DECK = join(ROOT, 'e2e/fixtures/publish-checks/audience')
const TRANSLATED = join(ROOT, 'e2e/fixtures/publish-checks/translated')
const TEACHER_BOTH = ['teacherzh41', 'guidezh52', 'teacheren41', 'guideen52']
const TEACHER = ['teacheronly42', 'guideonly17', 'answerkey99', 'demotips', '演示合并之前先断开网络', '这一节整节只给教师']
const NESTED = ['tabkey31', 'tipkey58', 'cardkey64', 'listkey72', 'includekey85', 'handbook23', '助教手册', 'tabfoot36', 'notefoot47', 'dropfoot53']

function deck(source = DECK): string {
  const work = join(ROOT, 'e2e/fixtures/regression/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'audience-'))
  cpSync(source, dir, { recursive: true })
  writeFileSync(join(dir, '.gitignore'), '*\n')
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
  return dir
}

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
    const full = await presmium(dir, ['ir'])
    for (const text of NESTED) expect(full.stdout.toLowerCase(), text).toContain(text)
    const student = holding(out, 'studentvisible')
    for (const output of [/^ir\.json$/, /^web\/.*\.html$/, /^web\/assets\/chunks\/@localSearchIndexroot\.\w+\.js$/, /^slides\/assets\/.*\.js$/, /^notebook\/.*\.ipynb$/]) {
      expect(student.some(file => output.test(file)), String(output)).toBe(true)
    }
    const { sections } = JSON.parse(readFileSync(join(out, 'ir.json'), 'utf8')) as { sections: { title: string, index: number }[] }
    expect(sections.map(s => [s.index, s.title])).toEqual([[1, '受众测试'], [2, '合并规则'], [3, '练习']])
    const checked = await presmium(dir, ['check', '--audience', 'student', '--json'])
    expect(checked.code, checked.stdout + checked.stderr).toBe(0)
    const { findings } = JSON.parse(checked.stdout) as { findings: { checkId: string, severity: string }[] }
    expect(findings.filter(f => f.checkId === 'presmium.audience' || f.severity === 'error')).toEqual([])
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

async function mcp(url: string, host: string, token: string, method: string, params: Record<string, unknown>): Promise<Record<string, any>> {
  const answer = await raw(`${url}/mcp`, {
    headers: { 'Host': host, 'Authorization': `Bearer ${token}`, 'Accept': 'application/json, text/event-stream' },
    json: { jsonrpc: '2.0', id: 1, method, params },
  })
  expect(answer.status, answer.text).toBe(200)
  const data = answer.text.trimStart().startsWith('{') ? answer.text : answer.text.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('')
  return JSON.parse(data) as Record<string, any>
}

describe('a deck with a translation, for an audience', () => {
  const dirs: string[] = []
  afterAll(() => dirs.forEach(remove))

  it('builds neither language with the teacher\'s content, and compiles the translation without writing a file in the deck', async () => {
    const dir = deck(TRANSLATED)
    dirs.push(dir)
    const originalEntries = readdirSync(dir)
    const snapshot = (file: string) => {
      const { ino, mtimeNs } = statSync(join(dir, file), { bigint: true })
      return { content: readFileSync(join(dir, file)), ino, mtimeNs }
    }
    const sources = new Map(originalEntries.map(file => [file, snapshot(file)]))
    const written: string[] = []
    const watcher = watch(dir, (_event, name) => name && written.push(name))
    const built = await presmium(dir, ['build', '--audience', 'student', '--out', 'student'])
    watcher.close()
    expect(built.code, built.stdout + built.stderr).toBe(0)
    const out = join(dir, 'student')
    for (const text of TEACHER_BOTH) expect(holding(out, text), text).toEqual([])
    expect(holding(join(out, 'web/en'), 'studenten').length).toBeGreaterThan(0)
    expect(holding(join(out, 'web'), 'studentzh').length).toBeGreaterThan(0)
    for (const [file, before] of sources) expect(snapshot(file), file).toEqual(before)
    expect(written.filter(name => name.startsWith('.presmium-translation'))).toEqual([])
    const allowed = new Set([...originalEntries, 'student', '.presmium', 'node_modules'])
    expect(new Set(readdirSync(dir))).toEqual(allowed)
    expect(written.filter(name => !allowed.has(name))).toEqual([])
  }, 300_000)

  it('builds a whole compilation for the audience (the build\'s audience option): neither language with the teacher\'s content; a leak is reported without its sentence', async () => {
    const dir = deck(TRANSLATED)
    dirs.push(dir)
    appendFileSync(join(dir, 'lecture.en.md'), '\n```{code} python\n:run:\nprint("Note for teachers: unplug the network before the demo, " + "password TEACHEREN41.")\n```\n')
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

describe('presmium serve: a document with a translation', () => {
  let dir: string | undefined
  afterAll(() => remove(dir))

  it('says in the diagnostics that the workspace site leaves the translation out', async () => {
    dir = workspace('translated-local', 'translated', { '@lincyaw/addon-exec': 'packages/addon-exec', '@lincyaw/web': 'packages/web' })
    cpSync(TRANSLATED, join(dir, 'course'), { recursive: true })
    cpSync(join(FIXTURES, 'plugins/presmium-fixture-token'), join(dir, 'node_modules/presmium-fixture-token'), { recursive: true })
    const config = join(dir, 'presmium.workspace.yaml')
    writeFileSync(config, readFileSync(config, 'utf8').replace('\'@lincyaw/web\']', '\'@lincyaw/web\', presmium-fixture-token]'))
    const entry = join(dir, 'course/lecture.md')
    writeFileSync(entry, readFileSync(entry, 'utf8').replace('plugins:\n', 'plugins:\n  - presmium-fixture-token\n'))
    const local = presmiumProcess(dir, ['serve', '--port', '0'])
    try {
      const url = (await waitFor(local, /^serve {2}(http:\/\/127\.0\.0\.1:\d+)$/m))[1]!
      const grant = await raw(`${url}/__presmium/fixture.token/token`, { headers: { 'Presmium-Document': 'course' } })
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
