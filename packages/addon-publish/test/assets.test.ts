import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { Compiler } from '@presmium/compiler'
import { PNG } from 'pngjs'
import { afterAll, expect, it } from 'vitest'
import { copyFixture, removeCopies } from './helpers.ts'

afterAll(removeCopies)

it('downloads the remote images of a deck at once, and tries a failed one once per process (N-03)', async () => {
  const image = PNG.sync.write(new PNG({ width: 2, height: 2 }))
  const requests: string[] = []
  const server = createServer((request, response) => {
    requests.push(request.url!)
    const missing = request.url === '/missing'
    setTimeout(() => (missing ? response.writeHead(404).end() : response.writeHead(200, { 'content-type': 'image/png' }).end(image)), missing ? 2000 : 1000)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const dir = copyFixture('assets')
  const lecture = join(dir, 'lecture.md')
  writeFileSync(lecture, readFileSync(lecture, 'utf8').replaceAll('REMOTE', `http://127.0.0.1:${(server.address() as AddressInfo).port}`))
  const compiler = new Compiler(dir)
  const timed = async () => {
    const start = Date.now()
    const { doc } = await compiler.compile()
    return { ms: Date.now() - start, warnings: doc.diagnostics.filter(f => f.checkId === 'presmium.publish').map(f => f.message) }
  }
  try {
    const first = await timed()
    expect(first.ms).toBeLessThan(4000)
    expect(first.warnings).toEqual([expect.stringMatching(/^remote image http:\S+\/missing was not downloaded \(HTTP 404\)/)])
    expect(readdirSync(join(dir, '.presmium/assets'))).toHaveLength(4)

    const second = await timed()
    expect(second.ms).toBeLessThan(1500)
    expect(second.warnings).toEqual(first.warnings)
    expect(requests.sort()).toEqual(['/1', '/2', '/3', '/4', '/missing'])
  } finally {
    server.close()
  }
}, 60_000)
