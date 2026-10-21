import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import type { IRBlock } from '../packages/kernel/src/ir.ts'
import { openSlide, presmium, useFixture } from './fixtures/deck.ts'

test.describe.configure({ mode: 'default' })
const teacher = useFixture('teacher-database', {
  to: 'web,slides,notebook',
  edit: dir => execFileSync('git', ['init', '--quiet'], { cwd: dir }),
})

function codes(blocks: IRBlock[]): IRBlock[] {
  return blocks.flatMap(block => [block, ...block.node.type === 'component' ? codes(block.node.children ?? []) : []])
    .filter(block => block.node.type === 'code')
}

test('a teacher can compile the source-backed shared database and hand students a runnable notebook', async () => {
  const deck = teacher()
  const check = await presmium(['check'], deck.dir)
  expect(check).toContain('0 errors, 0 warnings')
  const run = (section: string) => codes(deck.doc.sections.find(item => item.id === section)!.blocks)
    .flatMap(block => block.node.type === 'code' ? block.node.outputs ?? [] : [])
  expect(run('memory').map(output => output.stdout)).toEqual(['memory: 10\n'])
  expect(run('shared-session').map(output => output.stdout)).toEqual([
    "history: [('Ada', 10), ('Lin', 7), ('Ada', 12)]\nAda: 12\nmissing: None\n",
  ])
  expect(run('predict-update').map(output => output.stdout)).toEqual(['15 4\n'])
  expect(run('delete').map(output => output.stdout)).toEqual(['', "Lin: None\nlast record: ('Lin', None)\n"])

  const notebook = JSON.parse(readFileSync(join(deck.dir, 'dist/notebook/lecture.ipynb'), 'utf8')) as {
    cells: { cell_type: string, source: string[] | string, outputs?: { text?: string[] | string }[] }[]
  }
  const source = (cell: { source: string[] | string }) => Array.isArray(cell.source) ? cell.source.join('') : cell.source
  expect(notebook.cells.filter(cell => cell.cell_type === 'code').some(cell => source(cell).includes('def put(key, value):'))).toBe(true)
  expect(notebook.cells.filter(cell => cell.cell_type === 'code').some(cell => source(cell).includes('TemporaryDirectory'))).toBe(true)
  expect(notebook.cells.some(cell => source(cell).includes('def latest(records, wanted):'))).toBe(true)
  expect(notebook.cells.some(cell => source(cell).includes('<details>'))).toBe(true)
  const replay = execFileSync('python3', ['-c', [
    'import json, sys',
    'notebook = json.load(sys.stdin)',
    'scope = {}',
    'for cell in notebook["cells"]:',
    '    if cell["cell_type"] != "code": continue',
    '    source = "".join(cell["source"])',
    '    if "def latest(records, wanted):" in source: break',
    '    exec(source, scope)',
  ].join('\n')], { input: JSON.stringify(notebook), encoding: 'utf8' })
  expect(replay).toContain('memory: 10\n')
  expect(replay).toContain('Ada: 12\nmissing: None\n')
  expect(replay).toContain('records: 3\nrecovered Ada: 2\n')
})

test('the teacher can reverse a code change and step a query backwards in both presentation forms', async ({ page }) => {
  const deck = teacher()
  await page.goto(`${deck.web}/?view=present&section=evolution&step=0`)
  const stage = page.getByRole('region', { name: '放映' })
  const original = stage.locator('.pm-code-block').filter({ hasText: 'rows[key] = value' })
  const changed = stage.locator('.pm-code-block').filter({ hasText: 'log.append((key, value))' })
  await expect(original).toBeVisible()
  await expect(changed).toBeHidden()
  await page.keyboard.press('ArrowRight')
  await expect(changed).toBeVisible()
  await expect(original).toBeHidden()
  await page.keyboard.press('ArrowLeft')
  await expect(original).toBeVisible()
  await expect(changed).toBeHidden()

  await page.goto(`${deck.web}/?view=present&section=trace-lookup&step=7`)
  const webTrace = page.getByRole('region', { name: '放映' }).locator('.pm-step-run')
  await expect(webTrace).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  await expect(webTrace.locator('.pm-step-run__output')).toHaveText('15\n')
  await page.keyboard.press('ArrowLeft')
  await expect(webTrace).toHaveAttribute('data-step', '6')
  await expect(webTrace.locator('.pm-step-run__output')).toHaveText('')

  const evolution = await openSlide(page, deck, 'evolution', '第二步：覆盖写，还是追加写？', '?clicks=0')
  const slideOriginal = evolution.locator('.slidev-vclick-target').filter({ hasText: 'rows[key] = value' })
  const slideChanged = evolution.locator('.slidev-vclick-target').filter({ hasText: 'log.append((key, value))' })
  await expect(slideOriginal).not.toHaveClass(/slidev-vclick-hidden/)
  await expect(slideChanged).toHaveClass(/slidev-vclick-hidden/)
  await page.keyboard.press('ArrowRight')
  await expect(slideChanged).not.toHaveClass(/slidev-vclick-hidden/)
  await expect(slideOriginal).toHaveClass(/slidev-vclick-hidden/)
  await page.keyboard.press('ArrowLeft')
  await expect(slideOriginal).not.toHaveClass(/slidev-vclick-hidden/)
  await expect(slideChanged).toHaveClass(/slidev-vclick-hidden/)

  const slide = await openSlide(page, deck, 'trace-lookup', '第六步：逐行看查询为什么返回最新值')
  const trace = slide.locator('.pm-step-run')
  await expect(trace).toHaveAttribute('data-state', 'ready', { timeout: 60_000 })
  await expect(trace).toHaveAttribute('data-steps', '7')
  for (let step = 1; step <= 7; step++) await page.keyboard.press('ArrowRight')
  await expect(trace.locator('.pm-step-run__output')).toHaveText('15\n')
  await page.keyboard.press('ArrowLeft')
  await expect(trace).toHaveAttribute('data-step', '6')
  await expect(trace.locator('.pm-step-run__output')).toHaveText('')
})

test('students can run the shared database, predict an update, change disk parameters and correct their query', async ({ page }) => {
  test.setTimeout(120_000)
  const deck = teacher()
  await page.goto(`${deck.web}/`)
  const section = (id: string) => page.locator(`.pm-section[data-section="${id}"]`)
  const run = async (id: string) => {
    const block = section(id).locator('.pm-code-block[data-session="teacher-db"]')
    await block.getByRole('button', { name: /^(运行|重跑)$/ }).click({ timeout: 10_000 })
    await expect(block.locator('.pm-outputs')).toHaveAttribute('data-source', 'live', { timeout: 60_000 })
    return block.locator('.pm-outputs')
  }
  await expect(await run('memory')).toContainText('memory: 10')
  await expect(await run('append-log')).toContainText("log: [('Ada', 10)]")
  const shared = await run('shared-session')
  await expect(shared).toContainText('Ada: 12')
  await expect(shared).toContainText('missing: None')

  const prediction = section('predict-update').locator('.pm-predict')
  const revealed = section('predict-update').locator('.pm-code-block[data-session="teacher-db"]')
  await expect(revealed).toBeHidden()
  await prediction.getByRole('radio', { name: '15 4', exact: true }).check()
  await prediction.getByRole('button', { name: '保存预测' }).click()
  await expect(await run('predict-update')).toContainText('15 4')

  const panel = section('disk').locator('.pm-run-panel')
  await panel.locator('.pm-run-panel__run').click()
  await expect(panel.locator('.pm-run-panel__output')).toHaveAttribute('data-source', 'live', { timeout: 60_000 })
  await expect(panel.locator('.pm-run-panel__stdout')).toHaveText('records: 3\nrecovered Ada: 2\n')
  await panel.locator('input[name="updates"]').fill('5')
  await panel.locator('.pm-run-panel__run').click()
  await expect(panel.locator('.pm-run-panel__stdout')).toHaveText('records: 5\nrecovered Ada: 4\n')

  const exercise = section('exercise').locator('.pm-exercise')
  await exercise.getByRole('button', { name: '提交' }).click()
  await expect(exercise.locator('.pm-exercise__verdict')).toHaveText('未通过 1/3', { timeout: 60_000 })
  await exercise.getByLabel('练习代码').fill('def latest(records, wanted):\n    for key, value in reversed(records):\n        if key == wanted:\n            return value\n    return None')
  await exercise.getByRole('button', { name: '提交' }).click()
  await expect(exercise.locator('.pm-exercise__verdict')).toHaveText('通过 3/3', { timeout: 60_000 })

  const slide = await openSlide(page, deck, 'predict-update', '第五步：先预测，再运行', '?clicks=0')
  await expect(slide.getByText('日志已经有 Ada=10、Lin=7、Ada=12 三条记录。', { exact: true })).toBeVisible()
  await expect(slide.locator('.pm-predict__reveal .slidev-vclick-target').first()).toHaveClass(/slidev-vclick-hidden/)
  await page.keyboard.press('ArrowRight')
  await expect(slide.getByRole('button', { name: 'Run code' })).toBeVisible()
  await expect(slide.locator('.slidev-runner-output .output-line')).toHaveText(['预录输出', '15 4'])
  expect(codes(deck.doc.sections.find(section => section.id === 'predict-update')!.blocks)
    .some(block => block.node.type === 'code' && block.node.run?.session === 'teacher-db')).toBe(true)
})
