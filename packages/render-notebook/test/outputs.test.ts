import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import { afterAll, expect, it } from 'vitest'

const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const EXEC = fileURLToPath(new URL('../../addon-exec', import.meta.url))
const NBFORMAT = spawnSync('python3', ['-c', 'import nbformat']).status === 0
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

const DECK = `---
title: 富输出
plugins:
  - ${EXEC}
---

## 图片

\`\`\`{code} python
:run:
import struct, zlib
from IPython.display import Image, display

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

rows = b''.join(b'\\x00' + b'\\x20\\x80\\xd0' * 4 for _ in range(4))
png = b'\\x89PNG\\r\\n\\x1a\\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 4, 4, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')
print("一张小图")
display(Image(data=png))
\`\`\`

## 表格

\`\`\`{code} python
:run:
:echo: false
from IPython.display import Markdown, display
display(Markdown("| 词 | 次数 |\\n|---|---|\\n| 低 | 3 |"))
\`\`\`
`

interface Cell {
  cell_type: string
  metadata: Record<string, unknown>
  execution_count?: number | null
  outputs?: { output_type: string, name?: string, data?: Record<string, unknown> }[]
}

it('writes the recorded outputs into the cells as they are, and hides the source of code with :echo: false', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-outputs-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'lecture.md'), DECK)
  mkdirSync(join(dir, 'node_modules/@presmium'), { recursive: true })
  symlinkSync(PACKAGE, join(dir, 'node_modules/@presmium/render-notebook'))
  const result = await presmium(dir, ['build', '--to', 'notebook'])
  expect(result.code, result.stdout + result.stderr).toBe(0)
  const file = join(dir, 'dist/notebook/lecture.ipynb')
  const code = (JSON.parse(readFileSync(file, 'utf8')).cells as Cell[]).filter(cell => cell.cell_type === 'code')
  expect(code).toHaveLength(2)

  const [image, table] = code
  expect(image!.outputs?.map(o => o.output_type)).toEqual(['stream', 'display_data'])
  const png = image!.outputs![1]!.data!['image/png'] as string
  expect(Buffer.from(png, 'base64').subarray(1, 4).toString()).toBe('PNG')
  expect(image!.execution_count).toBe(1)
  expect(image!.metadata.jupyter).toBeUndefined()

  expect(table!.metadata.jupyter).toEqual({ source_hidden: true })
  expect([table!.outputs?.[0]?.data?.['text/markdown']].flat().join('')).toContain('| 低 | 3 |')
  expect(table!.execution_count).toBe(2)

  if (NBFORMAT) {
    const validated = spawnSync('python3', ['-c', 'import sys, nbformat; nbformat.validate(nbformat.read(sys.argv[1], 4))', file], { encoding: 'utf8' })
    expect(validated.status, validated.stderr).toBe(0)
  }
})
