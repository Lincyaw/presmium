// The workspace site (P-122, docs/ir.md 6.3): `presmium build` at the workspace root builds one site whose
// home page lists every document and links to `/<dir>/`, each document readable on its own pages and
// searchable in its own index; in a document's directory it builds that document only.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIXTURES, presmium, remove, workspace } from './helpers.ts'

/** The text of a document's search index chunk (the web renderer's own MiniSearch index). */
function searchIndex(site: string): string {
  const chunks = join(site, 'assets/chunks')
  const file = readdirSync(chunks).find(name => name.startsWith('@localSearchIndexroot'))
  if (!file) throw new Error(`no search index in ${chunks}`)
  return readFileSync(join(chunks, file), 'utf8')
}

describe('presmium build of a workspace', () => {
  let dir: string
  beforeAll(() => {
    dir = workspace('site', join(FIXTURES, 'site'))
  })
  afterAll(() => remove(dir))

  it('builds the site at the root: the home page lists the documents, each readable and searchable under its directory', async () => {
    const built = await presmium(dir, ['build'])
    expect(built.code, built.stderr).toBe(0)
    expect(built.stdout).toMatch(/^document {2}alpha {2}甲文档$/m)
    expect(built.stdout).toMatch(/^document {2}beta {2}乙文档$/m)
    expect(built.stdout).toMatch(/^web {2}dist\/web$/m)
    const site = join(dir, 'dist/web')

    const home = readFileSync(join(site, 'index.html'), 'utf8')
    expect(home).toContain('测试工作区')
    for (const [doc, title] of [['alpha', '甲文档'], ['beta', '乙文档']]) {
      expect(home).toMatch(new RegExp(`<a class="pm-site-home__link" href="/${doc}/">${title}</a>`))
    }
    expect(home).toContain('入门')

    // Each document under its directory, its assets under it too, with its own pages.
    const alpha = readFileSync(join(site, 'alpha/index.html'), 'utf8')
    expect(alpha).toContain('甲文档的第一章')
    expect(alpha).toContain('src="/alpha/assets/')
    expect(readFileSync(join(site, 'beta/index.html'), 'utf8')).toContain('乙文档讲 quokkaland')
    expect(readFileSync(join(site, 'beta/more.html'), 'utf8')).toContain('乙文档的第二章')

    // Each document is searched on its own.
    expect(searchIndex(join(site, 'alpha'))).toContain('zymurgy')
    expect(searchIndex(join(site, 'alpha'))).not.toContain('quokkaland')
    expect(searchIndex(join(site, 'beta'))).toContain('quokkaland')
    expect(searchIndex(join(site, 'beta'))).not.toContain('zymurgy')
  }, 600_000)

  it('builds only the one document in its directory', async () => {
    const built = await presmium(join(dir, 'beta'), ['build', '--to', 'web'])
    expect(built.code, built.stderr).toBe(0)
    expect(readFileSync(join(dir, 'beta/dist/web/index.html'), 'utf8')).toContain('乙文档讲 quokkaland')
    expect(existsSync(join(dir, 'beta/dist/ir.json'))).toBe(true)
    expect(existsSync(join(dir, 'alpha/dist'))).toBe(false)
  }, 300_000)
})
