import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IRDocument } from '@lincyaw/kernel'
import { expect, it } from 'vitest'
import { cleanEnv, FIXTURES, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'

it('updates cached preview sections and still republishes a changed local image in an unchanged section', async () => {
  const dir = workspace('preview-cache', join(FIXTURES, 'service'))
  writeFileSync(join(dir, 'presmium.workspace.yaml'), "title: Preview cache\ndocuments: ['talk/lecture.md']\n")
  const entry = join(dir, 'talk/lecture.md')
  const source = '# Cache\n\n## Prose\n\nOriginal paragraph.\n\n$$\nx=1\n$$\n\n## Image\n\n![Chart](chart.svg)\n'
  const image = join(dir, 'talk/chart.svg')
  writeFileSync(entry, source)
  writeFileSync(image, '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="red"/></svg>')
  const child = presmiumProcess(dir, ['serve', '--port', '0'], cleanEnv({ XDG_CACHE_HOME: join(dir, '.cache'), XDG_STATE_HOME: join(dir, '.state') }))
  try {
    const url = (await waitFor(child, /^serve {2}(http\S+)$/m))[1]!
    expect((await raw(`${url}/talk/`)).status).toBe(200)
    const preview = async () => {
      const response = await raw(`${url}/talk/@lincyaw/ir`)
      expect(response.status, response.text).toBe(200)
      return response.json<{ doc: IRDocument }>().doc
    }
    const first = await preview()
    expect(JSON.stringify(first)).toContain('katex')
    const imageURL = (doc: IRDocument): string => {
      const block = doc.sections.find(section => section.title === 'Image')!.blocks[0]!
      if (block.node.type !== 'markdown') throw new Error('expected an image')
      return JSON.stringify(block.node).match(/"url":"([^"]+chart\.svg)"/)![1]!
    }
    const before = imageURL(first)
    writeFileSync(image, readFileSync(image, 'utf8').replace('red', 'blue') + '\n')
    writeFileSync(entry, source.replace('Original paragraph.', 'Changed paragraph.'))
    await expect.poll(async () => JSON.stringify(await preview()), { timeout: 30_000 }).toContain('Changed paragraph.')
    const next = await preview()
    expect(imageURL(next)).not.toBe(before)
    await expect.poll(async () => (await raw(new URL(imageURL(next), url).href)).text, { timeout: 30_000 }).toContain('blue')
    expect(JSON.stringify(next)).toContain('katex')
    expect(JSON.stringify(first)).toContain('Original paragraph.')
  } finally {
    await child.stop()
    remove(dir)
  }
}, 120_000)
