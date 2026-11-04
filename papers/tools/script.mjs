// The narration of a document (the captions and the voiceover are both made from it) as one Markdown file to polish,
// and back. lecture.json stays the only source: the file is a working copy, exported, edited and imported, never kept.
//
//   node tools/script.mjs export <document> [--out <file.md>]     default <document>/dist/script.md
//   node tools/script.mjs import <document> [<file.md>]           writes the changed narrations into lecture.json
//
// In the file each step is a heading with its page and step title; under it each narration is one paragraph after its
// marker line `<!-- n: <narration id> -->`. Edit only the paragraphs. A word shown one way and spoken another is
// written {shown|spoken}, e.g. {10²³|十的二十三次方}; a cue is ⟦cue:<id>⟧ and must stay where it belongs. Import
// checks every marker against the document, refuses unknown or missing ones, and changes only the narrations whose
// text differs. After an import, regenerate the voiceover (tools/voiceover.mjs) and retime (tools/film.mjs retime).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const [command, document, ...rest] = process.argv.slice(2)
const usage = 'usage: node tools/script.mjs export <document> [--out <file.md>] | import <document> [<file.md>]'
if (!document || !['export', 'import'].includes(command)) { console.error(usage); process.exit(2) }
const entry = join(WORKSPACE, document, 'lecture.json')
const source = readFileSync(entry, 'utf8')
const doc = JSON.parse(source)
const defaultFile = join(WORKSPACE, document, 'dist', 'script.md')

/** A narration's content as one line of the file. */
function line(content) {
  return content.map(n => {
    if (n.type === 'text') return n.text
    if (n.type === 'pronunciation') return `{${n.display}|${n.spoken}}`
    if (n.type === 'cue') return `⟦cue:${n.id}⟧`
    throw new Error(`a narration node of type ${n.type} cannot be written to the script`)
  }).join('')
}

/** One line of the file back to narration content; cues are looked up by id in the narration they came from. */
function content(text, before) {
  const cues = new Map(before.filter(n => n.type === 'cue').map(n => [n.id, n]))
  const nodes = []
  const push = t => { if (!t) return; const last = nodes.at(-1); if (last?.type === 'text') last.text += t; else nodes.push({ type: 'text', text: t }) }
  for (const part of text.split(/(\{[^{}|]+\|[^{}]+\}|⟦cue:[^⟧]+⟧)/)) {
    const said = /^\{([^{}|]+)\|([^{}]+)\}$/.exec(part)
    const cue = /^⟦cue:([^⟧]+)⟧$/.exec(part)
    if (said) nodes.push({ type: 'pronunciation', display: said[1], spoken: said[2] })
    else if (cue) {
      if (!cues.has(cue[1])) throw new Error(`cue ${cue[1]} is not in this narration; cues cannot be added or moved between narrations here`)
      nodes.push(cues.get(cue[1])); cues.delete(cue[1])
    } else push(part)
  }
  if (cues.size) throw new Error(`cues ${[...cues.keys()].join(', ')} were removed; keep them in the text`)
  return nodes
}

const narrated = () => doc.sectionOrder.flatMap(sid => doc.sections[sid].stepOrder.map(st => ({ section: doc.sections[sid], step: doc.steps[st] })))
  .filter(({ step }) => step.narrationIds.length)

if (command === 'export') {
  const out = resolve(rest[rest.indexOf('--out') + 1] && rest.includes('--out') ? rest[rest.indexOf('--out') + 1] : defaultFile)
  const parts = [`# ${doc.metadata.title}`, '',
    '<!-- 讲稿：字幕与配音都由它生成。只改每段文字；不要改每段上面的 n: 标记行。{显示|读音} 写一个显示与读法不同的词，⟦cue:…⟧ 是提示点。改完运行 node tools/script.mjs import <文稿>。 -->', '']
  let page
  for (const { section, step } of narrated()) {
    if (section.id !== page) { parts.push(`## ${section.title}`, ''); page = section.id }
    parts.push(`### ${step.title ?? step.id}`, '')
    for (const id of step.narrationIds) parts.push(`<!-- n: ${id} -->`, line(doc.narrations[id].content), '')
  }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, parts.join('\n'))
  const chars = narrated().reduce((s, { step }) => s + step.narrationIds.reduce((t, id) => t + line(doc.narrations[id].content).length, 0), 0)
  console.log(`wrote ${out}: ${narrated().length} steps, about ${chars} characters`)
} else {
  const file = resolve(rest[0] ?? defaultFile)
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
  const found = new Map()
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const marker = /^<!-- n: (\S+) -->$/.exec(lines[i].trim())
    if (!marker) continue
    const body = []
    for (let j = i + 1; j < lines.length && !/^(<!-- n: |#)/.test(lines[j].trim()); j++) if (lines[j].trim()) body.push(lines[j].trim())
    if (found.has(marker[1])) throw new Error(`${marker[1]} appears twice in ${file}`)
    found.set(marker[1], body.join(''))
  }
  const expected = narrated().flatMap(({ step }) => step.narrationIds)
  const unknown = [...found.keys()].filter(id => !expected.includes(id))
  const missing = expected.filter(id => !found.has(id))
  if (unknown.length || missing.length) {
    console.error(`${file} does not match ${document}:${unknown.length ? ` unknown ${unknown.join(', ')};` : ''}${missing.length ? ` missing ${missing.join(', ')}` : ''}`)
    process.exit(1)
  }
  const changed = []
  for (const [id, body] of found) {
    if (!body) throw new Error(`${id} is empty; a step's narration cannot be removed here`)
    const before = doc.narrations[id].content
    if (line(before) === body) continue
    doc.narrations[id] = { ...doc.narrations[id], content: content(body, before) }
    changed.push(id)
  }
  if (!changed.length) { console.log('nothing changed'); process.exit(0) }
  const tmp = `${entry}.import-${process.pid}`
  // Keep the file's own indentation, so the change is only the narrations that changed.
  const indent = /^\{\n( +|\t)"/.exec(source)?.[1] ?? '  '
  writeFileSync(tmp, JSON.stringify(doc, null, indent) + '\n')
  renameSync(tmp, entry)
  console.log(`changed ${changed.length} narrations: ${changed.join(', ')}`)
  console.log(`next: node tools/voiceover.mjs ${document} --wait, then node tools/film.mjs retime ${document}`)
}
