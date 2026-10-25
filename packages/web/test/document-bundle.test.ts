import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { buildDocumentBundle, findDocumentBundle } from '../src/node/document-bundle.ts'

it('reuses a real document bundle built through a symlinked cache after a Markdown edit', async () => {
  const root = mkdtempSync(join(tmpdir(), 'presmium-document-bundle-'))
  try {
    const deck = join(root, 'deck')
    const cache = join(root, 'cache')
    const alias = join(root, 'cache-alias')
    mkdirSync(join(deck, 'components'), { recursive: true })
    mkdirSync(cache)
    symlinkSync(cache, alias, 'junction')
    const component = join(deck, 'components', 'Counter.tsx')
    writeFileSync(component, 'export default function Counter() { return null }\n')
    writeFileSync(join(deck, 'lecture.md'), '# Before\n')
    const input = { deckDir: deck, workspaceRoot: deck, outDir: alias, externals: [], nodePlugins: [] }
    const built = await buildDocumentBundle(input)
    expect(built).not.toBeNull()
    expect(Object.keys(built!.inputs)).toEqual([realpathSync(component)])
    expect(Object.keys(built!.inputs).every(file => existsSync(file))).toBe(true)
    writeFileSync(join(deck, 'lecture.md'), '# After\n')
    expect((await findDocumentBundle(input))?.key).toBe(built!.key)
    expect((await buildDocumentBundle(input))?.key).toBe(built!.key)
    writeFileSync(component, 'export default function RenamedCounter() { return null }\n')
    expect(await findDocumentBundle(input)).toBeUndefined()
    // Equivalent source can invalidate its stamps while producing identical minified code.
    expect((await buildDocumentBundle(input))?.key).toBe(built!.key)
    writeFileSync(component, 'export default function Counter() { return "Changed" }\n')
    expect(await findDocumentBundle(input)).toBeUndefined()
    expect((await buildDocumentBundle(input))?.key).not.toBe(built!.key)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
