import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ComponentNode, IRDocument } from '@presmium/kernel'
import { afterAll, expect, it } from 'vitest'
import { presmium } from './helpers.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/assets', import.meta.url))
const WORK = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium', import.meta.url))
mkdirSync(WORK, { recursive: true })
const dir = mkdtempSync(join(WORK, 'assets-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

it('publishes the file of a nested prop in the web, the slides and the notebook', async () => {
  cpSync(FIXTURE, dir, { recursive: true })
  const built = await presmium(dir, ['build', '--out', 'out'])
  expect(built.code, built.stdout + built.stderr).toBe(0)
  const name = readdirSync(join(dir, 'out/web/media')).find(file => file.endsWith('-a.txt'))!
  expect(name).toMatch(/^[0-9a-f]{8}-a\.txt$/)

  expect(readFileSync(join(dir, 'out/web/media', name), 'utf8')).toBe('附件的内容\n')
  const web = JSON.parse(readFileSync(join(dir, 'out/web/ir.json'), 'utf8')) as IRDocument
  const node = web.sections[0]!.blocks.find(b => b.node.type === 'component')!.node as ComponentNode
  expect(node.props).toEqual({ files: { a: `/web/media/${name}`, b: 'kept' } })

  expect(readFileSync(join(dir, '.presmium/slides/slides.md'), 'utf8')).toContain(`<a class="fixture-attach" href="/slides/${name}">a</a> kept`)
  expect(existsSync(join(dir, 'out/slides', name))).toBe(true)

  expect(readFileSync(join(dir, 'out/notebook/lecture.ipynb'), 'utf8')).toContain(`[a](media/${name}) kept`)
  expect(existsSync(join(dir, 'out/notebook/media', name))).toBe(true)
}, 300_000)
