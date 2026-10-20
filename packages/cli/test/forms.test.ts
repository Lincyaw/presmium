import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IRDocument } from '@lincyaw/kernel'
import { afterAll, expect, it } from 'vitest'
import { presmium } from './helpers.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/forms', import.meta.url))
const WORK = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium', import.meta.url))

mkdirSync(WORK, { recursive: true })
const dir = mkdtempSync(join(WORK, 'forms-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

it('writes the slides and the notebook in the deck\'s language and renders the deck\'s own components in the slides', async () => {
  cpSync(FIXTURE, dir, { recursive: true })
  const { code, stdout, stderr } = await presmium(dir, ['build', '--out', 'out'])
  expect(code, stdout + stderr).toBe(0)
  expect((JSON.parse(readFileSync(join(dir, 'out/ir.json'), 'utf8')) as IRDocument).meta.lang).toBe('fr')
  expect(stdout.split('\n').filter(line => line.includes('  warning  '))).toEqual([
    'lecture.md:22  warning  {component}: no plugin in `plugins` registers the component Unknown  (presmium.directive)',
  ])

  const slides = readFileSync(join(dir, '.presmium/slides/slides.md'), 'utf8')
  expect(slides).toContain('> The component Unknown can only be viewed on the web.')
  expect(slides).toContain('<div v-click="1">\n\n<PmStepScope :at="1">\n\n<PmBoundary name="StepBadge">\n\n<StepBadge label="étape" />')
  expect(existsSync(join(dir, '.presmium/slides/components/StepBadge.vue'))).toBe(true)
  const assets = join(dir, 'out/slides/assets')
  expect(readdirSync(assets, { recursive: true, encoding: 'utf8' }).some(file => file.endsWith('.js') && readFileSync(join(assets, file), 'utf8').includes('step-badge'))).toBe(true)

  const notebook = readFileSync(join(dir, 'out/notebook/lecture.ipynb'), 'utf8')
  expect(notebook).toContain('The interactive component `Unknown` can only be used in the web version.')
  expect(notebook).not.toMatch(/交互组件|网页版/)
}, 300_000)
