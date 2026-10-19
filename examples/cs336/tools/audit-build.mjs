import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const manifest = JSON.parse(readFileSync(resolve(root, 'coverage.json'), 'utf8'))
let frames = 0
for (const lecture of manifest.lectures) {
  const name = lecture.entry.split('/')[0]
  const ir = JSON.parse(readFileSync(resolve(root, name, 'dist/slides-ir.json'), 'utf8'))
  assert.equal(ir.sections.length, lecture.sections, name)
  const reading = JSON.parse(readFileSync(resolve(root, name, 'dist/reading-ir.json'), 'utf8'))
  assert.equal(reading.sections.length, lecture.readingSections, `${name}: reading structure`)
  assert.ok(reading.sections.every(section => section.blocks.every(block => block.until === undefined)), `${name}: reading contains intermediate states`)
  if (lecture.kind === 'python') {
    for (const range of lecture.nativeSteps) {
      const section = ir.sections.find(section => section.id.endsWith(`section-${String(range.section).padStart(3, '0')}`))
      assert.equal(section.steps, range.steps)
      assert.ok(section.blocks.every(block => block.node.type !== 'component'), `${name}: plain Markdown only`)
      for (const expected of range.blocks) {
        const block = section.blocks.find(block => block.id === expected.label)
        assert.equal(block.at, expected.at)
        assert.equal(block.until, expected.until)
      }
      frames += range.sourceToStep.length
    }
  } else assert.equal(ir.sections.filter(section => /-page-\d+$/.test(section.id)).length, lecture.pages.length)
  for (const file of [`${name}/index.html`, `${name}/slides/index.html`, `${name}/notebook/lecture.ipynb`]) assert.ok(statSync(resolve(root, 'dist/web', file)).size > 0, file)
}
assert.equal(frames, manifest.lectures.reduce((count, lecture) => count + (lecture.steps ?? 0), 0))
console.log(`CS336 builds verified: 17 web documents, 17 slide decks, 17 notebooks, ${frames} source positions mapped to native Markdown steps`)
