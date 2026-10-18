// The plugins' UIs and the slides' default theme in the design of N-10 (WP-95d; docs/architecture.md 5.11,
// docs/design/slide.dc.html, edit.dc.html):
// - The slides of a deck that names no theme are 书卷: paper and ink, the title in the serif, the section's chapter
//   in small accent letters above it, at the foot the deck's title, the slide's steps and its number; code of 18 px
//   or more on a 1280 px projection; light and dark. The cover has its own layout.
// - The plugins' components (quiz, predict, run panel, exercise, classroom, the core's stepper) and Mermaid's diagrams
//   use the host's controls and colours, in both forms: every text reaches WCAG AA and every field's border 3:1, light
//   and dark, on the slides (the lines a code's highlight leaves out, a step done and a diagram's labels too), in the
//   presenter view's panels with a classroom, and in the web form, and the reader's question panel too
//   (e2e/fixtures/plugin-ui, built). They draw the host's line icons, not glyphs.
// - The run panel as docs/design/slide.dc.html draws it: a bar above the code names the language and where it runs,
//   with the run button; the output, beside the code on a slide, says how long the run took; the web form and its
//   present view have the same bar.
// - In a workspace served on this machine, with the assistant as the operator's plugin and the scripted agent as its
//   runtime (e2e/fixtures/plugin-ui-workspace): the AI changes dock at the right of edit mode, switched by the
//   toolbar's "AI 修改"; the status bars name the model and where it comes from, and open the model settings, where
//   a key is asked for again once the service or its address changed, and which keep to a phone's screen; the home
//   page's card drafts a document with the assistant's agent.
import { execFileSync, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { lowContrast } from './fixtures/contrast.ts'
import { openDevPage, useFixture } from './fixtures/deck.ts'
import { startClassroomServer } from './fixtures/plugins/decks.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PRESMIUM = join(ROOT, 'packages/cli/bin/presmium.mjs')
const AGENT = join(ROOT, 'packages/addon-assistant/test/fixtures/scripted-agent.mjs')
const ASSISTANT = { '@presmium/slidev-addon-assistant': 'packages/addon-assistant' }

/** The colour scheme of both forms, remembered as each remembers the reader's switch. */
async function scheme(page: Page, dark: boolean): Promise<void> {
  await page.addInitScript((on) => {
    localStorage.setItem('vitepress-theme-appearance', on ? 'dark' : 'light')
    localStorage.setItem('slidev-color-schema', on ? 'dark' : 'light')
  }, dark)
}

test.describe('a deck built with the default theme', () => {
  test.describe.configure({ mode: 'default', timeout: 120_000 })
  // A classroom server, which the deck names: the presenter view shows the classroom's panels.
  let classroom: Awaited<ReturnType<typeof startClassroomServer>> | undefined
  test.beforeAll(async () => {
    classroom = await startClassroomServer()
  })
  test.afterAll(() => {
    classroom?.child.kill('SIGTERM')
  })
  const deck = useFixture('plugin-ui', {
    link: ASSISTANT,
    edit: (dir) => {
      const file = join(dir, 'lecture.md')
      writeFileSync(file, readFileSync(file, 'utf8').replace('renderers:', `presmium:\n  presmium.session:\n    server: ${classroom!.url}\nrenderers:`))
    },
  })

  test('its slides are 书卷: the chapter above the serif title, the foot with the deck, the steps and the number, code of 18 px or more', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    const index = deck().slide('merge')
    await page.goto(`${deck().slides}/${index}`)
    const slide = page.locator(`.slidev-page-${index} .slidev-layout`)
    await expect(slide).toHaveClass(/pm-book/)
    await expect(slide).toHaveCSS('background-color', 'rgb(247, 245, 240)')
    await expect(slide.locator('.pm-book__chapter')).toHaveText('合并的规则')
    await expect(slide.locator('.pm-book__chapter')).toHaveCSS('color', 'rgb(15, 95, 92)')
    expect(await slide.locator('h1').evaluate(el => getComputedStyle(el).fontFamily)).toMatch(/^"?Source Serif 4/)
    const foot = slide.locator('.pm-book-footer')
    await expect(foot.locator('.pm-book-footer__title')).toHaveText('书卷样式')
    await expect(foot.locator('.pm-book-footer__page')).toHaveText(`${index} / ${deck().doc.sections.length}`)
    const steps = foot.getByRole('img', { name: '第 0 步，共 2 步' })
    await expect(steps.locator('span')).toHaveCount(2)
    await page.keyboard.press('ArrowRight')
    await expect(foot.getByRole('img', { name: '第 1 步，共 2 步' }).locator('span[data-done]')).toHaveCount(1)
    // The code's size on the screen: its font size, scaled with the slide (R-27).
    const code = slide.locator('.slidev-code').first()
    expect(await code.evaluate((el: HTMLElement) => Number.parseFloat(getComputedStyle(el).fontSize) * el.getBoundingClientRect().height / el.offsetHeight)).toBeGreaterThanOrEqual(18)

    await page.goto(`${deck().slides}/1`)
    await expect(page.locator('.slidev-page-1 .slidev-layout')).toHaveClass(/pm-book--cover/)
    await expect(page.locator('.slidev-page-1 .pm-book-footer__title')).toHaveCount(0)
  })

  for (const dark of [false, true]) {
    test(`every slide, components included, reaches WCAG AA, its fields 3:1, and the run button keeps its ink (${dark ? 'dark' : 'light'})`, async ({ page }) => {
      await scheme(page, dark)
      await page.setViewportSize({ width: 1280, height: 720 })
      for (const section of deck().doc.sections) {
        await page.goto(`${deck().slides}/${section.index}?clicks=${section.steps}`)
        const slide = page.locator(`.slidev-page-${section.index}`)
        await expect(slide.locator('h1').first()).toBeVisible()
        await expect(slide.locator('.slidev-layout')).toHaveCSS('background-color', dark ? 'rgb(22, 22, 20)' : 'rgb(247, 245, 240)')
        if (section.id === 'diagram') await expect(slide.locator('.mermaid')).toBeVisible()
        expect(await lowContrast(page, `.slidev-page-${section.index}`), section.id).toEqual([])
      }
      // Slidev's reset leaves the host's filled buttons filled.
      await page.goto(`${deck().slides}/${deck().slide('run')}`)
      await expect(page.locator('.pm-run-panel__run').first()).toHaveCSS('background-color', dark ? 'rgb(237, 234, 227)' : 'rgb(28, 27, 25)')
    })

    test(`the presenter view's panels, the classroom's controls among them, reach WCAG AA, their fields 3:1 (${dark ? 'dark' : 'light'})`, async ({ page }) => {
      await scheme(page, dark)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(`${deck().slides}/presenter/${deck().slide('merge')}`)
      const panels = page.locator('.pm-presenter-panels')
      await panels.locator('summary').click()
      const session = panels.locator('[data-panel="presmium.session"]')
      await expect(session.getByLabel('昵称')).toBeVisible()
      await expect(panels.locator('[data-panel="presmium.classroom"]')).toBeVisible()
      expect(await lowContrast(page, '.pm-presenter-panels')).toEqual([])
      // With a classroom: its link, the participants and the classroom's figures.
      await session.getByLabel('昵称').fill('王老师')
      await session.getByRole('button', { name: '创建课堂' }).click()
      await expect(session.getByRole('img', { name: '加入课堂的二维码' }).locator('svg')).toBeVisible()
      expect(await lowContrast(page, '.pm-presenter-panels')).toEqual([])
    })

    test(`in the web form the components and the question panel reach WCAG AA, their fields 3:1 (${dark ? 'dark' : 'light'})`, async ({ page }) => {
      await scheme(page, dark)
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(`${deck().web}/basics.html`)
      for (const name of ['quiz', 'predict', 'run-panel', 'exercise', 'question-box', 'pulse', 'demo-stepper']) await expect(page.locator(`.pm-${name}`).first()).toBeVisible()
      await expect(page.locator('.pm-mermaid[data-rendered]')).toHaveAttribute('data-theme', dark ? 'dark' : 'default')
      await expect(page.locator('.pm-run-panel__run')).toHaveCSS('background-color', dark ? 'rgb(237, 234, 227)' : 'rgb(28, 27, 25)')
      // The components and the diagram; the code inside them is highlighted by the web form, as the deck's other code.
      expect(await lowContrast(page, ':is(.pm-quiz, .pm-predict, .pm-run-panel, .pm-exercise, .pm-question-box, .pm-pulse, .pm-demo-stepper, .pm-mermaid)', 'pre.shiki')).toEqual([])
      await page.locator('.pm-assistant-toolbar').filter({ visible: true }).getByRole('button', { name: '提问' }).click()
      const ask = page.getByRole('dialog', { name: '向 AI 提问' })
      await expect(ask.getByLabel('地址')).toBeVisible()
      expect(await lowContrast(page, '.pm-assistant-popover')).toEqual([])
    })
  }

  /** Pyodide loads with the first run. */
  const RUNTIME = { timeout: 180_000 }

  test('the run panel names the language and where it runs above the code, with its run button; its output, beside the code on a slide, says how long the run took', async ({ page }) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 1280, height: 720 })
    const index = deck().slide('run')
    await page.goto(`${deck().slides}/${index}`)
    const panel = page.locator(`.slidev-page-${index} .pm-run-panel`)
    const bar = panel.locator('.pm-run-panel__bar')
    await expect(bar.locator('.pm-run-panel__where')).toHaveText('Python · 浏览器中运行')
    const [top, code] = await Promise.all([bar.boundingBox(), panel.locator('.pm-run-panel__source pre').boundingBox()])
    expect(top!.y + top!.height).toBeLessThanOrEqual(code!.y + 1)
    await bar.locator('.pm-run-panel__run').click()
    const output = panel.locator('.pm-run-panel__output')
    await expect(output.locator('.pm-run-panel__stdout')).toContainText('合并第 2 轮', RUNTIME)
    await expect(output.locator('.pm-run-panel__label')).toHaveText(/^输出 · \d+\.\d{2} 秒$/)
    const [main, beside] = await Promise.all([panel.locator('.pm-run-panel__main').boundingBox(), output.boundingBox()])
    expect(beside!.x).toBeGreaterThanOrEqual(main!.x + main!.width - 1)
    expect(beside!.y).toBeLessThan(main!.y + main!.height)

    // The web form and its present view draw the same bar.
    await page.goto(`${deck().web}/basics.html`)
    await expect(page.locator('.pm-section[data-section="run"] .pm-run-panel__where')).toHaveText('Python · 浏览器中运行')
    await page.goto(`${deck().web}/basics.html?view=present&section=run`)
    await expect(page.getByRole('region', { name: '放映' }).locator('.pm-run-panel__where')).toHaveText('Python · 浏览器中运行')
  })

  test('the plugins draw the host\'s line icons, not glyphs: the exercise\'s marks, the high-contrast switch, the step buttons of a traced run', async ({ page }) => {
    test.setTimeout(240_000)
    await page.goto(`${deck().web}/basics.html`)
    // The document form traces the code once the block nears the viewport.
    const traced = page.locator('.pm-section[data-section="trace"] .pm-step-run')
    await traced.scrollIntoViewIfNeeded()
    const stepper = traced.locator('.pm-step-run__stepper')
    await expect(stepper).toBeVisible(RUNTIME)
    await expect(stepper.locator('button svg.pm-ui-icon')).toHaveCount(2)
    expect(await stepper.textContent()).not.toMatch(/[◀▶]/)
    const exercise = page.locator('.pm-section[data-section="exercise"] .pm-exercise')
    await exercise.getByRole('button', { name: '提交' }).click()
    const cases = exercise.locator('.pm-exercise__cases li')
    await expect(cases.first()).toBeVisible(RUNTIME)
    await expect(cases.locator('svg.pm-exercise__mark')).toHaveCount(await cases.count())
    expect(await exercise.locator('.pm-exercise__cases').textContent()).not.toMatch(/[✓✗]/)
    const toggle = page.getByRole('switch', { name: '高对比度' }).filter({ visible: true }).first()
    await expect(toggle.locator('svg.pm-ui-icon')).toHaveCount(1)
    expect(await toggle.textContent()).not.toMatch(/◐/)
  })
})

/** The test's environment without Presmium's variables or credentials, then `extra`. */
function clean(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  delete env.NODE_ENV
  for (const name of Object.keys(env)) {
    if (name.startsWith('PRESMIUM_') || name.startsWith('DEEPSEEK_') || name.startsWith('DSH_') || /(?:_KEY|_TOKEN|_SECRET|_PASSWORD|_APPID)$/i.test(name)) delete env[name]
  }
  return { ...env, ...extra }
}

test.describe('the assistant in a workspace served on this machine', () => {
  test.describe.configure({ mode: 'serial', timeout: 180_000 })
  let dir: string
  let child: ChildProcess | undefined
  let url: string

  test.beforeAll(async () => {
    test.setTimeout(300_000)
    const work = join(ROOT, 'examples/demo/.presmium')
    mkdirSync(work, { recursive: true })
    dir = mkdtempSync(join(work, 'e2e-plugin-ui-'))
    cpSync(join(ROOT, 'e2e/fixtures/plugin-ui-workspace'), dir, { recursive: true })
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\ndist/\n.presmium/\n')
    writeFileSync(join(dir, 'package.json'), `${JSON.stringify({ name: dir.split('/').at(-1)!.toLowerCase(), private: true, type: 'module' })}\n`)
    mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
    symlinkSync(join(ROOT, ASSISTANT['@presmium/slidev-addon-assistant']), join(dir, 'node_modules/@presmium/slidev-addon-assistant'), 'junction')
    const git = (args: string[]) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgSign=false', ...args], { cwd: dir })
    git(['init', '-q', '-b', 'main'])
    git(['add', '-A'])
    git(['commit', '-q', '-m', 'Initial commit'])
    child = spawn(process.execPath, [PRESMIUM, 'serve', '--port', '0'], {
      cwd: dir,
      env: clean({ PRESMIUM_AGENT_COMMAND: `${process.execPath} ${AGENT}`, PRESMIUM_AGENT_PROVIDER: 'Test Provider', XDG_STATE_HOME: `${dir}.state`, XDG_CACHE_HOME: `${dir}.cache`, XDG_CONFIG_HOME: `${dir}.config` }),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stderr!.on('data', (chunk: Buffer) => output += chunk)
    url = await new Promise<string>((resolve, reject) => {
      child!.stdout!.on('data', (chunk: Buffer) => {
        output += chunk
        const found = /^serve {2}(http\S+)$/m.exec(output)
        if (found) resolve(found[1]!)
      })
      child!.once('exit', code => reject(new Error(`presmium serve exited (${code}):\n${output}`)))
    })
  })
  test.afterAll(async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise(done => child!.once('exit', done))
      child.kill('SIGTERM')
      await exited
    }
    for (const path of [dir, `${dir}.state`, `${dir}.cache`, `${dir}.config`]) if (path) rmSync(path, { recursive: true, force: true })
  })

  /** The document's page, once the assistant has said what it may do there. */
  async function documentPage(page: Page): Promise<void> {
    await openDevPage(page, `${url}/intro/`, page.locator('[data-section="merge"]').first())
    await expect(page.locator('.pm-assistant-edit-toolbar').filter({ visible: true }).getByRole('button', { name: 'AI 修改' })).toHaveAttribute('aria-pressed', 'false', { timeout: 30_000 })
  }

  test('the home page names the model in its status bar, and its card drafts a document with the assistant\'s agent', async ({ page }) => {
    await openDevPage(page, `${url}/`, page.locator('.pm-site-home__document[data-document="intro"]'))
    await expect(page.locator('.pm-assistant-status').filter({ visible: true })).toHaveText('模型 Test Provider（来自环境变量）')
    await page.locator('.pm-workspace-draft-card').click()
    const documents = page.getByRole('dialog', { name: '管理文档' })
    await expect(documents.locator('input[name="draft"]')).toBeChecked()
    await expect(documents).toContainText('Test Provider')
  })

  for (const dark of [false, true]) {
    test(`"AI 修改" docks the panel at the right of edit mode and switches it, the status bar names the model, all at WCAG AA (${dark ? 'dark' : 'light'})`, async ({ page }) => {
      await scheme(page, dark)
      await page.setViewportSize({ width: 1440, height: 900 })
      await documentPage(page)
      const toggle = page.locator('.pm-assistant-edit-toolbar').filter({ visible: true }).getByRole('button', { name: 'AI 修改' })
      await toggle.click()
      await expect(page.locator('html')).toHaveClass(/pm-editing/)
      const panel = page.getByRole('region', { name: '批注与对话' })
      await expect(panel).toBeVisible()
      await expect(toggle).toHaveAttribute('aria-pressed', 'true')
      // At the right of the window, in the dock the shell gives it (the toolbar's `dock` slot).
      const box = (await panel.boundingBox())!
      expect(box.x).toBeGreaterThan(1440 * 0.6)
      expect(box.x + box.width).toBeLessThanOrEqual(1441)
      await expect(page.locator('html')).toHaveClass(/pm-edit-docked/)
      await expect(panel.getByRole('region', { name: '对话' }).locator('.pm-assistant-edit__provider')).toHaveText('修改由 Test Provider 的模型完成')
      await expect(page.locator('.pm-assistant-status').filter({ visible: true })).toHaveText('模型 Test Provider（来自环境变量）')
      expect(await lowContrast(page, '.pm-assistant-edit')).toEqual([])
      expect(await lowContrast(page, '.pm-assistant-status')).toEqual([])

      // The switch hides the panel and gives the dock's room back; edit mode stays on.
      await toggle.click()
      await expect(panel).toHaveCount(0)
      await expect(toggle).toHaveAttribute('aria-pressed', 'false')
      await expect(page.locator('html')).not.toHaveClass(/pm-edit-docked/)
      await expect(page.locator('html')).toHaveClass(/pm-editing/)
      await toggle.click()
      await expect(panel).toBeVisible()
    })
  }

  test('the model settings open from the status bar; once the service or its address changes the key is asked for again', async ({ page }) => {
    await documentPage(page)
    await page.locator('.pm-assistant-edit-toolbar').filter({ visible: true }).getByRole('button', { name: 'AI 修改' }).click()
    await page.locator('.pm-assistant-status').filter({ visible: true }).getByRole('button').click()
    const settings = page.getByRole('dialog', { name: '模型设置' })
    await expect(settings).toContainText('当前生效：环境变量 PRESMIUM_AGENT_COMMAND（Test Provider）')
    const key = settings.locator('input[name="key"]')
    await settings.locator('select[name="service"]').selectOption('custom')
    await settings.locator('input[name="provider"]').fill('Page Provider')
    await settings.locator('input[name="url"]').fill('https://models.example/v1')
    await expect(key).toHaveAttribute('required', '')
    await key.fill('page-key-95d')
    await settings.getByRole('button', { name: '保存' }).click()
    await expect(settings.locator('.pm-assistant-model__saved')).toHaveText('已保存')
    // Saved: the key stays while the service and its address stay, and is not shown.
    await expect(key).toHaveValue('')
    await expect(settings).toContainText('密钥（已设置，留空则不变）')
    await expect(key).not.toHaveAttribute('required')
    await settings.locator('input[name="url"]').fill('https://other.example/v1')
    await expect(settings).toContainText('密钥（换了服务或地址，需要重新填写）')
    await expect(key).toHaveAttribute('required', '')
    await settings.locator('input[name="url"]').fill('https://models.example/v1')
    await expect(key).not.toHaveAttribute('required')
    await settings.locator('select[name="service"]').selectOption('deepseek')
    await expect(key).toHaveAttribute('required', '')
    expect(await lowContrast(page, '.pm-assistant-model__panel')).toEqual([])

    // On a phone the dialog keeps to the screen: the file's path (a long one here) wraps, the fields fit.
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(settings.locator('.pm-assistant-model__note').last()).toContainText('assistant.json')
    const body = settings.locator('.pm-ui-dialog__body')
    expect(await body.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    const [panel, field] = await Promise.all([settings.boundingBox(), key.boundingBox()])
    expect(panel!.x + panel!.width).toBeLessThanOrEqual(390)
    expect(field!.x + field!.width).toBeLessThanOrEqual(panel!.x + panel!.width)
  })
})
