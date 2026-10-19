import { spawnSync } from 'node:child_process'
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { presmium } from './helpers.ts'
import { ROOT } from './serve-helpers.ts'

const DECK = join(ROOT, 'e2e/fixtures/publish-checks/checks')

const copies: string[] = []
afterAll(() => copies.forEach(dir => rmSync(dir, { recursive: true, force: true })))

interface Finding { checkId: string, severity: string, message: string, source: { file: string, line: number } }

it('reports a broken link, #nowhere, {csv-table} with :file: and a forbidden word on their lines, and a link only the slides break in the slides alone', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-publish-checks-'))
  copies.push(dir)
  cpSync(DECK, dir, { recursive: true })
  const lines = readFileSync(join(dir, 'lecture.md'), 'utf8').split('\n')
  const line = (text: string) => lines.findIndex(l => l.includes(text)) + 1

  const checked = await presmium(dir, ['check', '--json', '--external-links'])
  expect(checked.code).toBe(1)
  const { findings } = JSON.parse(checked.stdout) as { findings: Finding[] }
  const errors = findings.filter(f => f.severity === 'error').map(f => ({ checkId: f.checkId, line: f.source.line, message: f.message }))
  expect(errors).toEqual([
    { checkId: 'presmium.links', line: line('data/missing.csv'), message: expect.stringContaining('data/missing.csv: no such file') },
    { checkId: 'presmium.links', line: line('#nowhere'), message: expect.stringContaining('#nowhere is no section') },
    { checkId: 'presmium.directive', line: line('{csv-table}'), message: expect.stringMatching(/\{csv-table\}.*takes no :file:/) },
    { checkId: 'presmium.links', line: line('#web-note'), message: expect.stringMatching(/#web-note is no section.*\(in slides\)$/) },
    { checkId: 'presmium.forbid', line: line('T-123'), message: expect.stringContaining('"T-123" matches T-\\d{3}') },
  ])
  expect(findings.map(f => f.message).join('\n')).not.toMatch(/starter\.py|#tables|#later/)
  if (spawnSync('lychee', ['--version']).error) {
    expect(findings).toContainEqual(expect.objectContaining({ checkId: 'presmium.links', severity: 'info', message: expect.stringContaining('lychee is not installed') }))
  }

  writeFileSync(join(dir, 'lecture.md'), lines.join('\n').replace('other/lecture.md#later', 'other/lecture.md#sooner'))
  const again = JSON.parse((await presmium(dir, ['check', '--json'])).stdout) as { findings: Finding[] }
  expect(again.findings).toContainEqual(expect.objectContaining({
    checkId: 'presmium.links',
    severity: 'error',
    message: 'other/lecture.md#sooner: no section, block, label or heading of other/lecture.md has the id sooner',
    source: expect.objectContaining({ line: line('other/lecture.md#later') }),
  }))
})

const FAKE_LYCHEE = `#!/usr/bin/env node
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')
const args = process.argv.slice(2)
if (args.includes('--version')) {
  console.log('lychee 0.0.0-fake')
  process.exit(0)
}
writeFileSync(join(__dirname, 'argv.json'), JSON.stringify(args))
let input = ''
process.stdin.on('data', chunk => input += chunk)
process.stdin.on('end', async () => {
  writeFileSync(join(__dirname, 'stdin.txt'), input)
  const failed = []
  for (const url of input.split(/\\r?\\n/).map(line => line.trim()).filter(Boolean)) {
    const response = await fetch(url).catch(() => undefined)
    if (!response || !response.ok) failed.push({ url, status: { text: response ? response.statusText : 'error', code: response && response.status } })
  }
  console.log(JSON.stringify({ total: 0, fail_map: failed.length ? { stdin: failed } : {}, error_map: {} }))
  process.exit(failed.length ? 2 : 0)
})
`

it('--external-links gives lychee the URLs on its stdin: a dead link is reported on its line, the links of a page that works are not checked', async () => {
  const bin = mkdtempSync(join(tmpdir(), 'presmium-lychee-'))
  const dir = mkdtempSync(join(tmpdir(), 'presmium-external-'))
  copies.push(bin, dir)
  writeFileSync(join(bin, 'lychee'), FAKE_LYCHEE)
  chmodSync(join(bin, 'lychee'), 0o755)
  writeFileSync(join(bin, 'package.json'), '{"type":"commonjs"}\n')
  const server = createServer((request, response) => {
    if (request.url === '/ok') response.writeHead(200, { 'Content-Type': 'text/html' }).end('<a href="/inner-broken">x</a>')
    else response.writeHead(404, 'Not Found').end('nope')
  })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    writeFileSync(join(dir, 'lecture.md'), `---\ntitle: 外部链接\n---\n\n## 链接\n\n能打开的 [页面](${base}/ok)。\n\n打不开的 [页面](${base}/missing-page)。\n`)
    const checked = await presmium(dir, ['check', '--json', '--external-links'], { PATH: `${bin}${delimiter}${process.env.PATH}` })
    const { findings } = JSON.parse(checked.stdout) as { findings: Finding[] }
    const links = findings.filter(f => f.checkId === 'presmium.links').map(f => ({ line: f.source.line, message: f.message }))
    expect(links).toEqual([{ line: 9, message: `${base}/missing-page: Not Found` }])
    const argv = JSON.parse(readFileSync(join(bin, 'argv.json'), 'utf8')) as string[]
    expect(argv).toContain('-')
    expect(argv.join(' ')).not.toContain(base)
    expect(readFileSync(join(bin, 'stdin.txt'), 'utf8').split('\n').filter(Boolean).sort()).toEqual([`${base}/missing-page`, `${base}/ok`])
  } finally {
    server.close()
  }
})

it('publishes no document\'s source in a single deck\'s build: the link to another document stays as written, with a warning', async () => {
  const work = join(ROOT, 'e2e/fixtures/regression/.presmium')
  mkdirSync(work, { recursive: true })
  const dir = mkdtempSync(join(work, 'document-link-'))
  copies.push(dir)
  cpSync(DECK, dir, { recursive: true })
  writeFileSync(join(dir, '.gitignore'), '*\n')
  writeFileSync(join(dir, 'lecture.md'), `${readFileSync(join(dir, 'lecture.md'), 'utf8')}\n## 资料\n\n又见 [另一份](other/lecture%2Emd#later)，[讲义资料](handouts/)。\n`)
  mkdirSync(join(dir, 'handouts/nested'), { recursive: true })
  writeFileSync(join(dir, 'handouts/sheet.txt'), 'sheet\n')
  writeFileSync(join(dir, 'handouts/nested/lecture.md'), '---\ntitle: 嵌套\n---\n\n## 一节\n\n:::{notes}\nNESTEDSECRET\n:::\n')
  const built = await presmium(dir, ['build', '--to', 'notebook'])
  expect(built.stdout).toMatch(/lecture\.md:22 {2}warning {2}other\/lecture\.md#later is not published: it is the source of the document \S*other, which a workspace site links as its page/)
  expect(built.stdout).toMatch(/warning {2}other\/lecture%2Emd#later is not published: it is the source of the document \S*other/)
  const notebook = readFileSync(join(dir, 'dist/notebook/lecture.ipynb'), 'utf8')
  expect(notebook).toContain('other/lecture.md#later')
  const media = join(dir, 'dist/notebook/media')
  const published = existsSync(media) ? readdirSync(media, { recursive: true, encoding: 'utf8' }) : []
  expect(published.some(name => name.endsWith('sheet.txt'))).toBe(true)
  expect(published.filter(name => name.endsWith('lecture.md'))).toEqual([])
}, 120_000)
