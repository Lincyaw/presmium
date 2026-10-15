import { describe, expect, it } from 'vitest'
import { AnchorLock, CheckRegistry, createAnchorResolverRegistry } from '../src/index.ts'
import type { Check, CheckContext, Finding } from '../src/index.ts'

const ctx: CheckContext = {
  deckDir: '/deck',
  workspaceRoot: '/deck',
  headmatter: {},
  slides: [],
  src: { read: async () => undefined },
  resolvers: createAnchorResolverRegistry(),
  lock: AnchorLock.empty().toJSON(),
}

function check(id: string, findings: Finding[], delayMs = 0): Check {
  return { id, run: () => new Promise(resolve => setTimeout(() => resolve(findings), delayMs)) }
}

describe('CheckRegistry', () => {
  it('runs every check and keeps registration order', async () => {
    const slow: Finding = { checkId: 'slow', severity: 'warning', message: 'w', source: { file: '/deck/a.md', line: 3 } }
    const fast: Finding = { checkId: 'fast', severity: 'info', message: 'i' }
    const registry = new CheckRegistry([check('slow', [slow], 20), check('fast', [fast])])
    expect(await registry.run(ctx)).toEqual([slow, fast])
  })

  it('turns a crashing check into an error finding without stopping the others', async () => {
    const ok: Finding = { checkId: 'ok', severity: 'info', message: 'fine' }
    const registry = new CheckRegistry([
      { id: 'crash', run: async () => { throw new Error('no git') } },
      check('ok', [ok]),
    ])
    expect(await registry.run(ctx)).toEqual([
      { checkId: 'crash', severity: 'error', message: 'check crash crashed: no git' },
      ok,
    ])
  })

  it('rejects duplicate ids and supports unregistering', () => {
    const registry = new CheckRegistry()
    const off = registry.register(check('a', []))
    expect(() => registry.register(check('a', []))).toThrow('already registered')
    off()
    expect(registry.list()).toEqual([])
  })
})
