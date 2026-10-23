import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import type { IRBlock } from '../packages/kernel/src/ir.ts'
import { presmium, useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default', timeout: 180_000 })
test.use({ locale: 'zh-CN' })
const course = useFixture('database-course', {
  to: 'web,slides,notebook',
  edit: dir => execFileSync('git', ['init', '--quiet'], { cwd: dir }),
})

function blocks(list: IRBlock[]): IRBlock[] {
  return list.flatMap(block => [block, ...block.node.type === 'component' ? blocks(block.node.children ?? []) : []])
}

function unindent(source: string): string {
  const lines = source.trimEnd().split('\n')
  const indentation = Math.min(...lines.filter(line => line.trim()).map(line => /^ */.exec(line)![0].length))
  return lines.map(line => line.slice(indentation)).join('\n').trim()
}

interface BenchmarkRound {
  case: string
  implementation: string
  sync: string
  keys: number
  batch_size?: number
  warmup: boolean
  trace_sha256?: string
  checksum: string
  transactions: number
  latency_ns: number[]
}

test('the disk course builds from real source and measured evidence, persists between processes, and exports runnable native notebook cells', async () => {
  const deck = course()
  expect(await presmium(['check'], deck.dir)).toContain('0 errors, 0 warnings')
  expect(deck.doc.diagnostics.filter(finding => finding.severity === 'error')).toEqual([])
  const references = deck.doc.sections.flatMap(section => blocks(section.blocks)).flatMap(block =>
    block.node.type === 'code' && block.node.origin ? [block.node] : [])
  expect(references.length).toBeGreaterThanOrEqual(10)
  for (const code of references) {
    const origin = code.origin!
    expect(origin.status, origin.anchor).toBe('exact')
    const actual = readFileSync(join(deck.dir, origin.file), 'utf8').split('\n').slice(origin.startLine - 1, origin.endLine).join('\n')
    expect(unindent(code.value), origin.anchor).toBe(unindent(actual))
  }
  for (const id of ['sparse-implementation', 'flush-implementation', 'lsm-compact-implementation']) {
    expect(blocks(deck.doc.sections.find(section => section.id === id)!.blocks).some(block => block.node.type === 'code' && block.node.origin?.file === 'code/lsm.py'), id).toBe(true)
  }

  const raw = JSON.parse(readFileSync(join(deck.dir, 'results/raw.json'), 'utf8')) as {
    metadata: { repeats: number, warmups: number, smoke: boolean, source_unchanged: boolean, source_sha256: Record<string, string>, read_sizes: number[], cpu: string, python: string, seed: number }
    rounds: BenchmarkRound[]
    correctness: unknown[]
  }
  expect(raw.metadata).toMatchObject({ repeats: 5, warmups: 1, smoke: false, source_unchanged: true, seed: 3362026, read_sizes: [256, 1024, 4096] })
  expect(raw.metadata.cpu).toBeTruthy()
  expect(raw.metadata.python).toBeTruthy()
  expect(raw.correctness).toHaveLength(12)
  for (const [file, checksum] of Object.entries(raw.metadata.source_sha256)) {
    expect(createHash('sha256').update(readFileSync(join(deck.dir, 'code', file))).digest('hex'), file).toBe(checksum)
  }
  const measured = new Map<string, BenchmarkRound[]>()
  const trajectories = new Map<string, Set<string>>()
  for (const round of raw.rounds) {
    expect(round.latency_ns).toHaveLength(round.transactions)
    if (round.warmup) continue
    const group = [round.case, round.implementation, round.sync, round.keys, round.batch_size ?? 1].join(':')
    measured.set(group, [...measured.get(group) ?? [], round])
    if (round.trace_sha256) {
      const workload = [round.case, round.sync, round.keys].join(':')
      const values = trajectories.get(workload) ?? new Set<string>()
      values.add(`${round.trace_sha256}:${round.checksum}`)
      trajectories.set(workload, values)
    }
  }
  expect(measured.size).toBe(40)
  for (const rounds of measured.values()) expect(rounds).toHaveLength(5)
  for (const values of trajectories.values()) expect(values.size).toBe(1)

  const native = (action: string) => JSON.parse(execFileSync('python3', ['-B', 'code/demos.py', action, '--data', 'lab-data/e2e-processes'], { cwd: deck.dir, encoding: 'utf8', timeout: 30_000 }))
  // These are separate interpreter processes; a shared in-memory dictionary
  // cannot make the second invocation pass.
  expect(native('write')).toMatchObject({ action: 'writer-exits', stored: { Ada: { balance: 100 } } })
  const file = join(deck.dir, 'lab-data/e2e-processes/snapshot.json')
  expect(statSync(file).size).toBeGreaterThan(0)
  expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ Ada: { balance: 100 }, nullable: null })
  expect(native('read')).toMatchObject({ action: 'new-process-reads', Ada: { balance: 100 }, nullable_is_value: true, unknown: 'absent' })

  const notebook = readFileSync(join(deck.dir, 'dist/notebook/lecture.ipynb'), 'utf8')
  const replay = execFileSync('python3', ['-B', '-c', [
    'import json, pathlib, sys',
    'notebook = json.load(sys.stdin)',
    'scope = {"__name__": "__notebook__"}',
    'executed, setup = [], False',
    'for cell in notebook["cells"]:',
    '    if cell["cell_type"] != "code": continue',
    '    source = "".join(cell["source"])',
    '    section = cell.get("metadata", {}).get("presmium", {}).get("section")',
    '    selected = "from engine import" in source or "notebook_data" in source or section == "file-work"',
    '    if not selected: continue  # Deliberately skip exercise starters and quiz answers.',
    '    exec(source, scope)',
    '    executed.append(section)',
    '    setup = setup or "from engine import" in source',
    'assert setup and len(executed) >= 5, executed',
    'assert scope["JsonSnapshotStore"].__module__ == "engine"',
    'root = scope["notebook_data"]',
    'assert (root / "snapshot.json").stat().st_size > 0',
    'assert (root / "lsm" / "manifest.json").is_file()',
    'print("NOTEBOOK_EVIDENCE=" + json.dumps({"executed": executed, "native_files": True}))',
  ].join('\n')], { input: notebook, cwd: deck.dir, encoding: 'utf8', timeout: 60_000 })
  expect(replay).toContain('关闭再打开： True')
  expect(replay).toContain('实际恢复的键数: 100')
  expect(replay).toContain('LSM重开查询:')
  expect(replay).toContain('"native_files": true')
})

async function slideFits(slide: Locator, id: string): Promise<void> {
  await expect(slide.locator('h1')).toBeVisible()
  const overflow = await slide.evaluate(frame => {
    const box = frame.getBoundingClientRect()
    const footer = frame.querySelector('.pm-book-footer')?.getBoundingClientRect()
    const contentBottom = footer ? Math.min(box.bottom, footer.top - 4) : box.bottom
    return [...frame.querySelectorAll('h1, .slidev-layout > *, pre, table, .pm-code-origin')]
      .filter(element => !element.closest('.pm-book-footer'))
      .filter(element => {
        const style = getComputedStyle(element)
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getBoundingClientRect().height > 0
      })
      .filter(element => {
        const content = element.getBoundingClientRect()
        return content.top < box.top - 2 || content.bottom > contentBottom + 2 || content.right > box.right + 2 || content.left < box.left - 2
      }).map(element => ({ tag: element.tagName, text: element.textContent?.trim().slice(0, 100),
        beyondBottom: Math.round(element.getBoundingClientRect().bottom - contentBottom),
        beyondRight: Math.round(element.getBoundingClientRect().right - box.right) }))
  })
  expect.soft(overflow, `${id}: projected content stays inside the slide`).toEqual([])
}

test('students can inspect eight units, change actual file work, fix recovery, and project the index, flush and benchmark evidence', async ({ page }) => {
  const deck = course()
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${deck.web}/`)
  await expect(page.locator('.VPSidebar').getByRole('link', { name: /^单元 [1-8]：/ })).toHaveCount(8)
  const section = (id: string) => page.locator(`.pm-section[data-section="${id}"]`)
  const openSection = async (id: string) => {
    const href = await page.locator(`.VPSidebar a[href$="#${id}"]`).getAttribute('href')
    expect(href, `sidebar link to ${id}`).toBeTruthy()
    await page.goto(new URL(href!, `${deck.web}/`).href)
    await expect(section(id)).toBeVisible()
    return section(id)
  }
  for (const [id, snippet] of [
    ['index-implementation', 'read_frame'],
    ['sparse-implementation', '_find'],
    ['flush-implementation', 'flush'],
    ['lsm-compact-implementation', 'compact'],
  ] as const) {
    await openSection(id)
    await expect(section(id).locator('.pm-code-origin')).toContainText('code/')
    await expect(section(id).locator('pre')).toContainText(snippet)
  }
  const metadata = JSON.parse(readFileSync(join(deck.dir, 'results/raw.json'), 'utf8')).metadata as {
    python: string, os: string, seed: number, cpu: string, keys: number, read_sizes: number[], repeats: number, source_sha256: Record<string, string>
  }
  const summary = JSON.parse(readFileSync(join(deck.dir, 'results/summary.json'), 'utf8')) as {
    case: string, implementation: string, keys: number, throughput_median_ops_s: number
  }[]
  const throughput = (case_: string, name: string, size: number) => summary.find(row => row.case === case_ && row.implementation === name && row.keys === size)!.throughput_median_ops_s
  const largest = Math.max(...metadata.read_sizes)
  const improvement = (case_: string, before: string, after: string, size: number) => `${(throughput(case_, after, size) / throughput(case_, before, size)).toFixed(2)}×`
  const results = await openSection('benchmark-results')
  for (const content of [`${metadata.repeats} 次测量`, `N=${largest}`, improvement('write_updates', 'snapshot', 'append', metadata.keys),
    improvement('read_hit', 'append', 'indexed', largest), 'SQLite', improvement('read_hit', 'sqlite', 'indexed', largest), metadata.cpu, '页缓存']) await expect(results).toContainText(content)
  const report = await openSection('benchmark-full-report')
  for (const content of [`Python：${metadata.python.split(' ')[0]}`, metadata.os, `seed=${metadata.seed}`, metadata.source_sha256['engine.py']!]) await expect(report).toContainText(content)

  const panel = (await openSection('file-work')).locator('.pm-run-panel')
  await panel.locator('.pm-run-panel__run').click()
  const stdout = panel.locator('.pm-run-panel__stdout')
  await expect(panel.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'live', { timeout: 60_000 })
  await expect(stdout).toContainText('实际恢复的键数: 100')
  const before = await stdout.textContent() ?? ''
  const bytes = (text: string, label: string) => Number(new RegExp(`${label}: (\\d+)`).exec(text)![1])
  await panel.locator('input[name="records"]').fill('200')
  await panel.locator('.pm-run-panel__run').click()
  await expect(stdout).toContainText('实际恢复的键数: 200')
  const after = await stdout.textContent() ?? ''
  expect(bytes(after, '最终文件字节')).toBeGreaterThan(bytes(before, '最终文件字节'))
  expect(bytes(after, '累计提交给文件的字节')).toBeGreaterThan(bytes(before, '累计提交给文件的字节') * 3)

  const exercise = (await openSection('recovery-exercise')).locator('.pm-exercise')
  await exercise.getByRole('button', { name: '提交', exact: true }).click()
  await expect(exercise.locator('.pm-exercise__verdict')).toHaveText('未通过 3/4', { timeout: 60_000 })
  await expect(exercise.locator('.pm-exercise__cases li[data-ok="false"]')).toHaveCount(3)
  await exercise.getByLabel('练习代码').fill('def recovery_action(header_bytes, expected_payload, actual_payload, crc_ok):\n    if header_bytes < 8 or actual_payload < expected_payload:\n        return "truncate-tail"\n    if not crc_ok:\n        return "corrupt"\n    return "apply-batch"')
  await exercise.getByRole('button', { name: '提交', exact: true }).click()
  await expect(exercise.locator('.pm-exercise__verdict')).toHaveText('通过 4/4', { timeout: 60_000 })
  await expect(exercise.locator('.pm-exercise__cases li[data-ok="true"]')).toHaveCount(4)

  await page.setViewportSize({ width: 1280, height: 720 })
  const riskPages = [deck.doc.sections[0]!.id, 'snapshot-cost', 'snapshot-implementation', 'append-protocol',
    'index-implementation', 'recovery-lab', 'recovery-implementation', 'manifest-commit',
    'sparse-implementation', 'flush-implementation', 'lsm-compact-implementation', 'benchmark-results', 'benchmark-tradeoffs']
  for (const id of riskPages) {
    await page.goto(`${deck.slides}/${deck.slide(id)}?clicks=99`)
    const slide = page.locator(`.slidev-page-${deck.slide(id)}`)
    await slideFits(slide, id)
    await page.screenshot({ path: test.info().outputPath(`${id}-slide.png`), animations: 'disabled' })
  }
  expect(errors).toEqual([])
})
