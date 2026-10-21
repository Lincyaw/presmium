import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN } from '@lincyaw/cli/testing'
import { chromium, expect as browserExpect } from '@playwright/test'
import { expect, it } from 'vitest'

const FIXTURES = fileURLToPath(new URL('./fixtures', import.meta.url))

it('keeps standalone resource navigation outside embedded previews, retaining teaching views and section navigation in the preview', async () => {
  const dir = mkdtempSync(join(FIXTURES, '.preview-'))
  mkdirSync(join(dir, 'talk'))
  mkdirSync(join(dir, 'node_modules/@lincyaw'), { recursive: true })
  symlinkSync(fileURLToPath(new URL('..', import.meta.url)), join(dir, 'node_modules/@lincyaw/web'), 'junction')
  writeFileSync(join(dir, '.gitignore'), '*\n')
  writeFileSync(join(dir, 'presmium.workspace.yaml'), 'title: Embedded preview\n')
  writeFileSync(join(dir, 'talk/lecture.md'), `---
title: 课堂预览
lang: zh-CN
presmium:
  presmium.web: { slidesUrl: 'https://slides.example.test' }
renderers:
  web: {}
---

# 课堂预览

(query)=
## 查询

课堂中的代码演示。
`)
  const host = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end('<iframe title="preview" style="width:100vw;height:100vh;border:0"></iframe>')
  })
  await new Promise<void>(resolve => host.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${(host.address() as AddressInfo).port}`
  const { NODE_ENV: _test, ...env } = process.env
  const child = spawn(process.execPath, [PRESMIUM_BIN, 'serve', '--port', '0', '--preview-origin', origin], { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => output += chunk)
  child.stderr.on('data', (chunk: Buffer) => output += chunk)
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  try {
    browser = await chromium.launch({ headless: true })
    await expect.poll(() => output, { timeout: 30_000 }).toMatch(/^serve {2}(http\S+)$/m)
    const url = /^serve {2}(http\S+)$/m.exec(output)![1]!
    const response = await fetch(`${url}/__presmium/presmium.workspace/preview?document=talk`)
    expect(response.status).toBe(200)
    const { web } = await response.json() as { web: string }
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
    await page.goto(web)
    await browserExpect(page.getByRole('link', { name: '文档列表', exact: true }).filter({ visible: true })).toBeVisible({ timeout: 30_000 })
    await browserExpect(page.getByRole('link', { name: '在幻灯片中打开', exact: true }).first()).toBeVisible()

    await page.goto(origin)
    await page.getByTitle('preview').evaluate((frame: HTMLIFrameElement, address) => {
      const url = new URL(address)
      url.searchParams.set('presmium-preview', 'embedded-navigation')
      frame.src = url.href
    }, web)
    const frame = page.frameLocator('iframe')
    await browserExpect(frame.locator('html')).toHaveAttribute('data-presmium-preview', 'on', { timeout: 30_000 })
    await browserExpect(frame.getByRole('link', { name: '文档列表', exact: true })).toHaveCount(0)
    await browserExpect(frame.getByRole('link', { name: '在幻灯片中打开', exact: true })).toHaveCount(0)
    const views = frame.getByRole('combobox', { name: '视图', exact: true }).filter({ visible: true })
    await browserExpect(views.locator('option[value="present"]')).toHaveText('放映')
    await browserExpect(frame.getByRole('link', { name: '查询', exact: true }).first()).toBeVisible()

    await page.goto(`${web}?presmium-preview=standalone-parameter`)
    await browserExpect(page.getByRole('link', { name: '文档列表', exact: true }).filter({ visible: true })).toBeVisible()
  } finally {
    await browser?.close()
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    await exited
    await new Promise<void>(resolve => { host.close(() => resolve()); host.closeAllConnections() })
    rmSync(dir, { recursive: true, force: true })
  }
}, 120_000)
