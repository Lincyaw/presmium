import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, posix, sep } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { FIXTURES, presmium, remove, workspace } from './helpers.ts'

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

  it('builds the site at the root: the home page lists the documents, each readable under its directory and searching them all', async () => {
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

    const alpha = readFileSync(join(site, 'alpha/index.html'), 'utf8')
    expect(alpha).toContain('甲文档的第一章')
    expect(alpha).toContain('src="/alpha/assets/')
    expect(readFileSync(join(site, 'beta/index.html'), 'utf8')).toContain('乙文档讲 quokkaland')
    expect(readFileSync(join(site, 'beta/more.html'), 'utf8')).toContain('乙文档的第二章')

    for (const doc of ['alpha', 'beta']) {
      expect(searchIndex(join(site, doc))).toContain('zymurgy')
      expect(searchIndex(join(site, doc))).toContain('quokkaland')
    }
    expect(searchIndex(join(site, 'alpha'))).toContain('/beta/more.html')
  }, 600_000)

  it('builds the site under `site.base` (a GitHub Pages project site): every local link and asset of every page is under it and names a file of the site', async () => {
    const sub = workspace('site-base', join(FIXTURES, 'site'))
    try {
      writeFileSync(join(sub, 'presmium.workspace.yaml'), `${readFileSync(join(sub, 'presmium.workspace.yaml'), 'utf8')}site: { base: /course/ }\n`)
      const built = await presmium(sub, ['build'])
      expect(built.code, built.stderr).toBe(0)
      const site = join(sub, 'dist/web')
      expect(readFileSync(join(site, 'index.html'), 'utf8')).toMatch(/<a class="pm-site-home__link" href="\/course\/alpha\/">甲文档<\/a>/)
      expect(readFileSync(join(site, 'alpha/index.html'), 'utf8')).toContain('src="/course/alpha/assets/')

      const wrong: string[] = []
      for (const file of readdirSync(site, { recursive: true, encoding: 'utf8' }).filter(name => name.endsWith('.html'))) {
        const page = `/course/${file.split(sep).join('/')}`
        for (const [, raw] of readFileSync(join(site, file), 'utf8').matchAll(/\s(?:href|src)="([^"]*)"/g)) {
          const path = raw!.replace(/&amp;/g, '&').replace(/[?#].*$/s, '')
          if (!path || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) continue
          const target = path.startsWith('/') ? path : posix.join(posix.dirname(page), path) + (path.endsWith('/') ? '/' : '')
          const local = join(site, ...decodeURI(target).replace(/^\/course\//, '').split('/'))
          const found = target.startsWith('/course/') && (target.endsWith('/') ? existsSync(join(local, 'index.html')) : existsSync(local))
          if (!found) wrong.push(`${page} -> ${raw}`)
        }
      }
      expect(wrong).toEqual([])
    } finally {
      remove(sub)
    }
  }, 600_000)

  it('builds only the one document in its directory', async () => {
    const built = await presmium(join(dir, 'beta'), ['build', '--to', 'web'])
    expect(built.code, built.stderr).toBe(0)
    expect(readFileSync(join(dir, 'beta/dist/web/index.html'), 'utf8')).toContain('乙文档讲 quokkaland')
    expect(existsSync(join(dir, 'beta/dist/ir.json'))).toBe(true)
    expect(existsSync(join(dir, 'alpha/dist'))).toBe(false)
  }, 300_000)
})
