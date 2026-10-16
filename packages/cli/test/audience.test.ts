// Audiences (WP-87, P-55, docs/ir.md 2.11): `presmium build --audience student` leaves the teacher's blocks and
// sections out of every output and scans what it wrote for their sentences; in `presmium serve` (SHARED) readers
// see the student view: their pages, the IR module the pages load, the search index and what a `tutor` MCP token
// reads, while editors see the whole deck.
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { presmium } from './helpers.ts'
import type { SharedSetup } from './serve-helpers.ts'
import { FIXTURES, raw, remove, ROOT, shared, workspace } from './serve-helpers.ts'

const DECK = join(ROOT, 'e2e/fixtures/publish-checks/audience')
/** What only the teacher's blocks and section hold (lowercase: the search index keeps its terms so). */
const TEACHER = ['teacheronly42', 'guideonly17', 'answerkey99', 'demotips', '演示合并之前先断开网络', '这一节整节只给教师']

/** A copy of the deck in examples/demo/.presmium, where its plugins, Slidev and VitePress resolve. */
function deck(): string {
  const work = join(ROOT, 'examples/demo/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'audience-'))
  cpSync(DECK, dir, { recursive: true })
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
    for (const text of TEACHER) expect(holding(out, text), text).toEqual([])
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

  it('gives a reader\'s page, IR module and search index no teacher\'s sentence, an editor\'s IR all; a reader\'s tutor token reads the student view', async () => {
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
    for (const text of TEACHER) {
      for (const answer of [page, module, index]) expect(answer.text.toLowerCase(), text).not.toContain(text)
    }
    const full = await raw(`${setup.url}/course/@id/__x00__virtual:presmium/ir`, { headers: editor })
    expect(full.text).toContain('TEACHERONLY42')
    expect(full.text).toContain('GUIDEONLY17')

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
