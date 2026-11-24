import type { IRDocument, MdastNode } from '@lincyaw/kernel'
import { expect, it } from 'vitest'
import { fixtures, presmium } from './helpers.ts'

it('gives {ref}, {eq} and {numref} without text the title or number of their target', async () => {
  const dir = fixtures()
  const { code, stdout, stderr } = await presmium(dir, ['ir', 'refs'])
  expect(code).toBe(0)
  const doc = JSON.parse(stdout) as IRDocument
  const text = (node: MdastNode): string => node.value ?? (node.children ?? []).map(text).join('')
  const references = (node: MdastNode): MdastNode[] => node.type === 'crossReference' ? [node] : (node.children ?? []).flatMap(references)
  const reading = doc.sections.find(s => s.id === 'reading')!
  const found = reading.blocks.flatMap(b => b.node.type === 'markdown' ? references(b.node.mdast) : [])
  expect(found.map(r => [r.kind, r.identifier, text(r)])).toEqual([
    ['ref', 'energy', 'Mass and energy'],
    ['eq', 'eq-energy', '(1)'],
    ['eq', 'eq-pythagoras', '(2)'],
    ['numref', 'fig-dot', 'Figure 1'],
    ['ref', 'energy', 'the first section'],
    ['ref', 'figures', 'Figures'],
    ['ref', 'nowhere', ''],
  ])
  expect(stderr).toContain('{ref} target "nowhere" not found')
})
