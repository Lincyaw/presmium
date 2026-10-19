import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = path => readFileSync(resolve(root, path))
const hash = data => createHash('sha256').update(data).digest('hex')
const manifest = JSON.parse(read('coverage.json'))
assert.equal(manifest.commit, 'de53a9f979a6ee35f7d13a5e1aadee5ea1afc58e')
assert.deepEqual(manifest.lectures.map(row => row.lecture), Array.from({ length: 17 }, (_, n) => n + 1))
const pageCounts = new Map([[3, 67], [4, 60], [5, 55], [8, 73], [9, 57], [11, 58], [15, 65], [16, 61]])
let events = 0
let pages = 0
for (const lecture of manifest.lectures) {
  const body = read(lecture.entry).toString()
  const slides = read(lecture.slidesEntry).toString()
  assert.equal(hash(slides), lecture.slidesSha256)
  assert.ok(!body.includes('{slide}') && !body.includes(':until:') && !body.includes('\"dtype\"'), `${lecture.entry}: document contains presentation scaffolding`)
  assert.equal(hash(read(lecture.source)), lecture.sourceSha256, `source changed: ${lecture.source}`)
  assert.equal(hash(body), lecture.documentSha256, `document changed: ${lecture.entry}; regenerate or update its provenance after editing`)
  for (const markdown of [body, slides]) {
    for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)) {
      if (!/^https?:/.test(match[1])) assert.ok(existsSync(resolve(root, dirname(lecture.entry), match[1])), `${lecture.entry}: missing figure ${match[1]}`)
    }
  }
  if (lecture.kind === 'pdf') {
    assert.equal(lecture.pages.length, pageCounts.get(lecture.lecture))
    assert.equal((slides.match(/\(cs336-\d+-page-\d+\)=/g) ?? []).length, lecture.pages.length)
    for (const page of lecture.pages) {
      assert.equal(hash(read(page.image)), page.imageSha256, page.image)
      assert.equal(hash(read(page.markdown)), page.markdownSha256, page.markdown)
      assert.ok(read(page.markdown).length > 0, page.markdown)
      assert.ok(slides.includes(`pages/page-${String(page.page).padStart(3, '0')}.webp`))
    }
    pages += lecture.pages.length
  } else {
    const raw = read(lecture.source.replace(/source\/(lecture_\d+).py/, 'source/var/traces/$1.json'))
    assert.equal(hash(raw), lecture.traceSha256)
    const trace = JSON.parse(raw)
    assert.equal(trace.steps.length, lecture.steps)
    const expected = trace.steps.flatMap((step, n) => step.renderings.map((_, k) => `${n}:${k}`))
    assert.deepEqual(lecture.renderings.map(item => `${item.step}:${item.rendering}`), expected)
    for (const asset of lecture.assets) assert.ok(existsSync(resolve(root, dirname(lecture.entry), asset)), asset)
    assert.equal(lecture.nativeSteps[0].start, 0)
    let next = 0
    for (const range of lecture.nativeSteps) {
      assert.equal(range.start, next, `missing or repeated source steps: ${lecture.entry}`)
      assert.ok(range.end >= range.start)
      assert.equal(range.sourceToStep.length, range.end - range.start + 1)
      assert.ok(range.sourceToStep.every(step => Number.isInteger(step) && step >= 0 && step <= range.steps))
      for (const block of range.blocks) {
        assert.ok(slides.includes(`:label: ${block.label}\n:at: ${block.at}\n`))
        if (block.until !== undefined) assert.ok(block.until > block.at && block.until <= range.steps)
      }
      next = range.end + 1
    }
    assert.equal(next, trace.steps.length, `incomplete native steps: ${lecture.entry}`)
    assert.ok(!body.includes('cs336-trace') && !body.includes('trace-plugin'))
    events += expected.length
  }
}
console.log(`CS336 complete: 17 lectures, 9 executable recordings, ${events} display events, ${pages} PDF pages; sources and local images verified`)
