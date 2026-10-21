import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { cleanEnv, FIXTURES, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'

it('returns the web preview without starting Slidev, then starts slides only when requested', async () => {
  const dir = workspace('preview-forms', join(FIXTURES, 'service'))
  const cache = join(dir, '.cache')
  writeFileSync(join(dir, 'presmium.workspace.yaml'), "title: Preview forms\ndocuments: ['*/lecture.md']\n")
  writeFileSync(join(dir, 'talk/lecture.md'), "---\ntitle: Preview forms\nplugins: ['@lincyaw/slidev-addon-core']\nrenderers:\n  web: {}\n  slides: {}\n---\n# Preview forms\n\n:::{slide}\nOne slide.\n:::\n")
  writeFileSync(join(dir, 'fresh/lecture.md'), '---\ntitle: Web only\nrenderers:\n  web: {}\n---\n# Web only\n')
  const child = presmiumProcess(dir, ['serve', '--port', '0'], cleanEnv({ XDG_CACHE_HOME: cache, XDG_STATE_HOME: join(dir, '.state') }))
  try {
    const url = (await waitFor(child, /^serve {2}(http\S+)$/m))[1]!
    const route = (query: string) => raw(`${url}/__presmium/presmium.workspace/preview?${query}`)
    const state = join(cache, 'presmium/serve', readdirSync(join(cache, 'presmium/serve'))[0]!)
    const deck = join(state, 'preview/talk/slides/slides.md')

    const web = await route('document=talk&view=web')
    expect(web.status, web.text).toBe(200)
    const addresses = { document: 'talk', web: `${url}/talk/`, slides: `${url}/__presmium/presmium.workspace/slides/talk/` }
    expect(web.json()).toEqual(addresses)
    expect(existsSync(join(state, 'preview'))).toBe(false)
    const only = await route('document=fresh&view=web')
    expect(only.json()).toEqual({ document: 'fresh', web: `${url}/fresh/` })
    expect((await route('document=talk&view=unsupported')).status).toBe(400)

    const slides = await route('document=talk&view=slides')
    expect(slides.status, slides.text).toBe(200)
    expect(slides.json()).toEqual(addresses)
    expect(existsSync(deck)).toBe(true)
    const page = await raw(addresses.slides)
    expect(page.status, page.text).toBe(200)
    expect(page.text).toContain('<html')
    expect((await route('document=talk')).json()).toEqual(addresses)
  } finally {
    await child.stop()
    remove(dir)
  }
}, 120_000)
