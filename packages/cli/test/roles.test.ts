import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IRDocument, MdastNode } from '@presmium/kernel'
import { afterAll, expect, it } from 'vitest'
import { presmium } from './helpers.ts'

const FIXTURE = fileURLToPath(new URL('./fixtures/roles', import.meta.url))
const WORK = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium', import.meta.url))
mkdirSync(WORK, { recursive: true })
const dir = mkdtempSync(join(WORK, 'roles-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function find(node: MdastNode, type: string): MdastNode[] {
  return [...node.type === type ? [node] : [], ...(node.children ?? []).flatMap(child => find(child, type))]
}

it('keeps a registered role as a presmiumRole node, flattens an unknown one, and shows the children on the web', async () => {
  cpSync(FIXTURE, dir, { recursive: true })
  const printed = await presmium(dir, ['ir'])
  expect(printed.code, printed.stderr).toBe(0)
  const doc = JSON.parse(printed.stdout) as IRDocument
  const block = doc.sections[0]!.blocks.find(b => b.node.type === 'markdown' && JSON.stringify(b.node).includes('presmiumRole'))!
  const mdast = (block.node as { mdast: MdastNode }).mdast
  expect(find(mdast, 'presmiumRole')).toEqual([
    { type: 'presmiumRole', plugin: 'fixture.probe', name: 'probe', options: { value: '可见的内容' }, children: [{ type: 'strong', children: [{ type: 'text', value: '可见的内容' }] }] },
    { type: 'presmiumRole', plugin: 'fixture.probe', name: 'probe', options: { mark: '提示', count: 2, value: 'hidden' }, children: [] },
  ])
  expect(find(mdast, 'text').map(node => node.value).join('')).toContain('之后 压平的文字')
  expect(printed.stderr).toMatch(/warning {2}unknown role \{nonesuch\}/)

  const built = await presmium(dir, ['build', '--to', 'web', '--out', 'out'])
  expect(built.code, built.stdout + built.stderr).toBe(0)
  const html = readdirSync(join(dir, 'out/web')).filter(file => file.endsWith('.html')).map(file => readFileSync(join(dir, 'out/web', file), 'utf8')).join('\n')
  expect(html).toContain('<strong>可见的内容</strong>')
  const paragraph = /<p>讲解前 [\s\S]*?<\/p>/.exec(html)?.[0]
  expect(paragraph).toBe('<p>讲解前 <span class="pm-role" data-role="probe"><strong>可见的内容</strong></span> 中间 <!----> 之后 压平的文字。</p>')
  expect(html).not.toContain('〔probe')
}, 300_000)
