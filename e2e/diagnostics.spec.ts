import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page, Route } from '@playwright/test'
import type { DiagnosticSnapshot } from '../packages/kernel/src/contracts/diagnostics.ts'
import { fakeModel } from '../packages/cli/src/testing.ts'
import type { FakeModel } from '../packages/cli/src/testing.ts'
import { startStudio } from './fixtures/workbench/studio.ts'
import type { Studio } from './fixtures/workbench/studio.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/diagnostics', import.meta.url))
const portOffset = Number(process.env.PRESMIUM_E2E_STUDIO_PORT_OFFSET ?? 0)
let studio: Studio
let model: FakeModel

test.describe.configure({ mode: 'serial', timeout: 300_000 })
test.use({ locale: 'zh-CN', actionTimeout: 30_000 })
test.beforeAll(async () => {
  model = await fakeModel([{ text: '已看到待处理诊断。' }])
  studio = await startStudio({ port: 5703 + portOffset, prefix: 'diagnostics', fixture: FIXTURE, model })
  // This fixture consumes the real public boundary from its declared peer dependency.
  const modules = join(studio.workspace.dir, 'node_modules/@lincyaw')
  mkdirSync(modules, { recursive: true })
  symlinkSync(fileURLToPath(new URL('../packages/host', import.meta.url)), join(modules, 'host'), 'junction')
})
test.afterAll(async () => { await studio?.close(); await model?.close() })
test.afterEach(async ({}, info) => {
  if (info.status !== info.expectedStatus && studio) await info.attach('workspace-service.log', { body: studio.service.process.output(), contentType: 'text/plain' })
})

const preview = (page: Page) => page.frameLocator('.pmw-preview__frame')
const problems = (page: Page) => page.getByRole('region', { name: '问题', exact: true })
async function openDocument(page: Page, title: string): Promise<void> {
  await page.locator('.pmw-home__card').filter({ hasText: title }).locator('.pmw-home__open').click()
  await expect(page.locator('.pmw-preview__frame')).toHaveAttribute('title', `${title} 的预览`)
}
async function diagnostics(page: Page, document: string): Promise<DiagnosticSnapshot> {
  const response = await page.request.get(`${studio.web.url}/api/presmium/diagnostics?document=${document}`)
  expect(response.ok()).toBe(true)
  return await response.json() as DiagnosticSnapshot
}

test('a compile error appears in the default preview and disappears after the source is repaired', async ({ page }) => {
  await studio.open(page)
  await openDocument(page, '诊断示例')
  await expect(page.locator('.pmw-doc__source')).toBeHidden()
  await expect(problems(page).getByRole('alert')).toContainText('diagnostics_unknown', { timeout: 120_000 })
  const before = await diagnostics(page, 'talk')
  expect(before.diagnostics.some(finding => finding.origin === 'compile' && finding.message.includes('diagnostics_unknown'))).toBe(true)
  expect(new Set(before.diagnostics.map(finding => finding.id)).size).toBe(before.diagnostics.length)
  const requests = () => model.received.filter(request => Array.isArray(request.body.tools))
  expect(requests()).toHaveLength(0)
  let release!: () => void
  let held!: () => void
  const released = new Promise<void>(resolve => { release = resolve })
  const captured = new Promise<void>(resolve => { held = resolve })
  const delay = async (route: Route) => {
    const response = await route.fetch()
    if (route.request().postDataJSON()?.document === 'talk') {
      held()
      await released
    }
    await route.fulfill({ response })
  }
  await page.route('**/api/presmium/context', delay)
  await problems(page).getByRole('button', { name: '让 AI 处理', exact: true }).click()
  await captured
  await page.locator('[data-activity="documents"]').click()
  await openDocument(page, '隔离讲义')
  const late = page.waitForResponse(response => response.url().endsWith('/api/presmium/context') && response.request().postDataJSON()?.document === 'talk')
  release()
  await (await late).finished()
  await page.unroute('**/api/presmium/context', delay)
  expect(requests()).toHaveLength(0)
  await page.locator('[data-activity="documents"]').click()
  await openDocument(page, '诊断示例')
  await expect(problems(page).getByRole('alert')).toContainText('diagnostics_unknown')
  await problems(page).getByRole('button', { name: '让 AI 处理', exact: true }).click()
  await expect(page.locator('[data-pmw-slot="main:conversation"]')).toContainText('已看到待处理诊断。', { timeout: 60_000 })
  expect(JSON.stringify(requests().at(-1)?.body.messages)).toContain('diagnostics_unknown')
  const requested = requests().length

  const file = join(studio.workspace.dir, 'talk/lecture.md')
  writeFileSync(file, readFileSync(file, 'utf8').replace(':::{diagnostics_unknown}\n:::', '编译已修复。'))
  await expect(preview(page).getByText('编译已修复。', { exact: true })).toBeVisible({ timeout: 120_000 })
  await expect(problems(page)).toBeHidden()
  await expect.poll(async () => (await diagnostics(page, 'talk')).diagnostics).toEqual([])
  expect(requests()).toHaveLength(requested)
})

test('runtime diagnostics follow the preview instance, stay in their document, and clear after recovery without a reload', async ({ page }) => {
  await studio.open(page)
  await openDocument(page, '诊断示例')
  await expect(preview(page).getByText('运行组件已恢复。', { exact: true })).toBeVisible({ timeout: 120_000 })
  const revision = async () => (await (await page.request.get(`${studio.web.url}/api/presmium/ir?document=talk`)).json()).revision as string
  const before = await revision()
  await preview(page).getByRole('button', { name: '触发运行错误', exact: true }).click()
  await expect(problems(page).getByRole('alert')).toContainText('诊断运行错误', { timeout: 60_000 })
  await expect.poll(async () => (await diagnostics(page, 'talk')).diagnostics).toContainEqual(expect.objectContaining({ document: 'talk', origin: 'runtime', renderer: 'web', message: '诊断运行错误' }))

  await page.locator('[data-activity="documents"]').click()
  await openDocument(page, '隔离讲义')
  await expect(preview(page).getByText('这份讲义没有错误。', { exact: true })).toBeVisible({ timeout: 120_000 })
  await expect(problems(page)).toBeHidden()
  expect((await diagnostics(page, 'other')).diagnostics).toEqual([])
  await expect.poll(async () => (await diagnostics(page, 'talk')).diagnostics.filter(finding => finding.origin === 'runtime')).toEqual([])

  await page.locator('[data-activity="documents"]').click()
  await openDocument(page, '诊断示例')
  await preview(page).getByRole('button', { name: '触发运行错误', exact: true }).click()
  await expect(problems(page).getByRole('alert')).toContainText('诊断运行错误', { timeout: 120_000 })
  await preview(page).locator('body').evaluate(() => (window as unknown as { diagnosticsKept: boolean }).diagnosticsKept = true)
  await preview(page).getByRole('button', { name: '恢复组件', exact: true }).click()
  await expect(preview(page).getByText('运行组件已恢复。', { exact: true })).toBeVisible({ timeout: 60_000 })
  await expect(problems(page)).toBeHidden()
  expect(await preview(page).locator('body').evaluate(() => (window as unknown as { diagnosticsKept?: boolean }).diagnosticsKept)).toBe(true)
  await expect.poll(async () => (await diagnostics(page, 'talk')).diagnostics).toEqual([])
  expect(await revision()).toBe(before)
})
