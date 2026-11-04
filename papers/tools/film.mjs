// The film of one document: its timing against the three-minute standard, retiming its scenes to the real
// voiceover, the video export, a contact sheet of the exported video, and the document check.
//
//   node tools/film.mjs check  <document>
//   node tools/film.mjs timing <document>            per step: 汉字, voice seconds, rate, state length, step length; the gate
//   node tools/film.mjs retime <document> [--lead 0] [--dry-run]  each scene state lasts as long as its step's voice (+ lead ms)
//   node tools/film.mjs export <document> [--size 1920x1080] [--fps 30] [--out <file.mp4>]
//   node tools/film.mjs frames <video> <outdir> [--document <document>]
//
// timing and retime read the real production plan of the running `presmium serve` (MCP read_production_plan: the
// cache-only plan the lecture export plays), so they need the voiceover generated (tools/voiceover.mjs) and the
// service running. retime writes lecture.json through the author actions (plan_document_change, then
// apply_document_change with the whole document as an explicit replacement: no semantic operation sets a definition's
// data), so the change has a history entry like any other. Beats inside a scene are placed as fractions of their
// state's length (kit/frame.ts `clock`), so after retiming each beat lands with its sentence.
// The gate: aim for about three minutes; PASS up to 6:00, the ceiling. Content a viewer needs is not cut to be short.
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { call, connect, WORKSPACE } from './mcp.mjs'

const GATE_MS = 360_000, AIM_MS = 180_000
const [command, target, ...rest] = process.argv.slice(2)
const option = (name, fallback) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : fallback }
const bin = name => join(WORKSPACE, 'node_modules/.bin', name)
const ffmpeg = () => {
  if (process.env.PRESMIUM_FFMPEG) return process.env.PRESMIUM_FFMPEG
  if (spawnSync('ffmpeg', ['-version']).status === 0) return 'ffmpeg'
  return join(process.env.HOME ?? '', '.local/share/presmium-toolchain/ffmpeg/ffmpeg')
}
const secs = ms => (ms / 1000).toFixed(1)
const clockText = ms => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`

/** What a reader counts in a sentence: every character but spaces and punctuation. */
const count = text => [...text.replace(/[\s，。、；：！？“”‘’（）《》,.;:!?()"'·—…-]/g, '')].length
const spoken = narration => narration.content.map(n => n.type === 'text' ? n.text : n.type === 'pronunciation' ? n.spoken : '').join('')

/** The saved document, its voiceover source and the real production plan. */
async function plan(client, document) {
  const { value: saved } = await call(client, 'get_document', { document })
  const { value: status } = await call(client, 'get_voiceover_status', { document })
  const { value: production } = await call(client, 'read_production_plan', { document, request: { source: status.source } })
  return { saved, status, production }
}

/** Per step of the plan: its narration, its voice, its scene state and its length. */
function steps(saved, production) {
  const doc = saved.content
  const voice = new Map()
  for (const seg of production.tracks.find(t => t.kind === 'voice')?.segments ?? []) {
    voice.set(seg.stepId, (voice.get(seg.stepId) ?? 0) + (seg.audio?.durationMs ?? ((seg.endMs ?? 0) - (seg.startMs ?? 0))))
  }
  return production.pages.flatMap(page => page.steps.map(step => {
    const authored = doc.steps[step.stepId]
    const text = (authored?.narrationIds ?? []).map(id => spoken(doc.narrations[id])).join('')
    const visual = authored?.visuals.find(v => v.state && doc.blocks[v.blockId]?.type === 'component')
    const definition = visual && doc.definitions[doc.blocks[visual.blockId].definitionId]
    const state = definition ? definition.states.findIndex(s => s.id === visual.state) : -1
    return {
      page: page.title, stepId: step.stepId, chars: count(text), voiceMs: voice.get(step.stepId) ?? 0,
      definitionId: definition?.id, state, stateMs: state >= 0 ? definition.data?.durations?.[state] : undefined,
      startMs: step.startMs ?? 0, lengthMs: (step.endMs ?? 0) - (step.startMs ?? 0),
    }
  }))
}

async function timing(document) {
  const client = await connect()
  try {
    const { saved, production } = await plan(client, document)
    if (production.timing !== 'confirmed') console.log(`the plan's timing is ${production.timing}: generate the voiceover first (tools/voiceover.mjs)`)
    const rows = steps(saved, production)
    console.log(['step', '汉字', 'voice s', '字/s', 'state s', 'step s'].join('\t'))
    for (const r of rows) console.log([r.stepId, r.chars, secs(r.voiceMs), r.voiceMs ? (r.chars / r.voiceMs * 1000).toFixed(2) : '-', r.stateMs === undefined ? '-' : secs(r.stateMs), secs(r.lengthMs)].join('\t'))
    const chars = rows.reduce((s, r) => s + r.chars, 0), voiceMs = rows.reduce((s, r) => s + r.voiceMs, 0)
    const total = production.durationMs ?? rows.reduce((s, r) => s + r.lengthMs, 0)
    const rate = chars / voiceMs * 1000
    // Were every state as long as its voice, the film would be its voice plus its pauses and holds.
    const floor = rows.reduce((s, r) => s + r.lengthMs - (r.voiceMs ? Math.max(0, (r.stateMs ?? 0) - r.voiceMs) : 0), 0)
    console.log(`\n${rows.length} steps, ${chars} 汉字 of narration, ${secs(voiceMs)} s of voice (${rate.toFixed(2)} 字/s)`)
    console.log(`film ${clockText(total)} (${secs(total)} s); with every state retimed to its voice about ${clockText(floor)} (${secs(floor)} s)`)
    const over = Math.min(total, floor) - GATE_MS
    if (total <= GATE_MS) console.log(`PASS: within the 6:00 ceiling (aim about 3:00; ${clockText(Math.abs(total - AIM_MS))} ${total > AIM_MS ? 'over' : 'under'} it)`)
    else console.log(`FAIL: ${secs(total - GATE_MS)} s over the 6:00 ceiling${floor < total ? ` (${floor <= GATE_MS ? 'retime alone passes' : `${secs(over)} s over even after retiming: cut about ${Math.ceil(over / 1000 * rate)} 汉字`})` : ''}`)
  } finally { await client.close() }
}

async function retime(document) {
  const lead = Number(option('lead', '0'))
  const client = await connect()
  try {
    const { saved, production } = await plan(client, document)
    if (production.timing !== 'confirmed') throw new Error(`the plan's timing is ${production.timing}: generate the voiceover first (tools/voiceover.mjs)`)
    const doc = structuredClone(saved.content)
    const changes = []
    for (const r of steps(saved, production)) {
      if (!r.definitionId || r.state < 0 || !r.voiceMs) continue
      const data = doc.definitions[r.definitionId].data ?? (doc.definitions[r.definitionId].data = {})
      const durations = data.durations ?? (data.durations = [])
      const next = Math.round(r.voiceMs + lead)
      if (durations[r.state] !== next) { changes.push(`${r.stepId}: ${secs(durations[r.state] ?? 0)} → ${secs(next)} s`); durations[r.state] = next }
    }
    if (!changes.length) return console.log('every scene state already matches its voice')
    const change = { id: `retime-${randomBytes(8).toString('hex')}`, baseDocumentVersion: saved.version, replacement: doc }
    const { value: planned } = await call(client, 'plan_document_change', { document, change })
    const errors = (planned.issues ?? []).filter(i => i.severity === 'error')
    if (errors.length) throw new Error(`the retimed document is not valid: ${errors.map(i => i.message).join('; ')}`)
    for (const line of changes) console.log(line)
    if (rest.includes('--dry-run')) return console.log(`planned ${planned.planId}, not applied (--dry-run); ${changes.length} states would be retimed`)
    const { value: applied } = await call(client, 'apply_document_change', { document, change, planId: planned.planId })
    console.log(`saved version ${applied.version}${applied.commit ? ` (${applied.commit.id ?? applied.commit.hash ?? 'commit'})` : ''}; ${changes.length} states retimed`)
  } finally { await client.close() }
}

function exportFilm(document) {
  const size = option('size', '1920x1080'), fps = option('fps', '30')
  const out = resolve(option('out', join(WORKSPACE, document, 'dist', `${document}.mp4`)))
  const env = { ...process.env, PRESMIUM_FFMPEG: ffmpeg() }
  const args = ['export', join(WORKSPACE, document), '--size', size, '--fps', fps, '--out', out]
  console.log(`presmium-lecture ${args.join(' ')}`)
  const run = spawnSync(bin('presmium-lecture'), args, { cwd: WORKSPACE, env, stdio: 'inherit' })
  if (run.status !== 0) process.exit(run.status ?? 1)
  console.log(`video ${out} (${secs(probe(out) * 1000)} s)`)
}

/** The length of a media file in seconds, from FFmpeg's own report. */
function probe(file) {
  const run = spawnSync(ffmpeg(), ['-hide_banner', '-i', file], { encoding: 'utf8' })
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(run.stderr)
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN
}

async function frames(video, outdir) {
  const document = option('document', basename(dirname(dirname(resolve(video)))))
  const client = await connect()
  let rows
  try {
    const { saved, production } = await plan(client, document)
    rows = steps(saved, production)
    const drift = probe(video) * 1000 - (production.durationMs ?? 0)
    if (Math.abs(drift) > 500) console.log(`warning: the video is ${secs(drift)} s longer than the production plan; the frames may be off`)
  } finally { await client.close() }
  mkdirSync(outdir, { recursive: true })
  const files = []
  // A step the video does not hold (the reading-only sources page) has no frame to take.
  rows.filter(r => r.lengthMs >= 600).forEach((r, i) => {
    for (const [tag, ms] of [['a', r.startMs + 300], ['b', r.startMs + r.lengthMs / 2]]) {
      const file = join(outdir, `${String(i).padStart(2, '0')}${tag}-${r.stepId}.png`)
      execFileSync(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-ss', (ms / 1000).toFixed(3), '-i', video, '-frames:v', '1', '-vf', 'scale=640:-2', file])
      files.push(file)
    }
  })
  const sheet = join(outdir, 'sheet.png')
  execFileSync('uv', ['run', '--no-project', '--with', 'pillow', 'python', '-I', join(WORKSPACE, 'tools/sheet.py'), sheet, ...files, '--cols', '4', '--width', '480'], { stdio: 'inherit' })
  console.log(`${files.length} frames (each step at its start + 0.3 s and its middle) in ${outdir}; sheet ${sheet}`)
}

function check(document) {
  const run = spawnSync(bin('presmium'), ['check', join(WORKSPACE, document), '--json'], { cwd: WORKSPACE, encoding: 'utf8', env: { ...process.env, PRESMIUM_FFMPEG: ffmpeg() } })
  let report
  try { report = JSON.parse(run.stdout) } catch { process.stdout.write(run.stdout + run.stderr); process.exit(run.status ?? 2) }
  console.log(`${report.counts.error} errors, ${report.counts.warning} warnings, ${report.counts.info} notes`)
  for (const f of report.findings) console.log(`${f.severity}: ${f.message}${f.source?.file ? ` (${basename(f.source.file)}${f.source.line ? `:${f.source.line}` : ''})` : ''}`)
  process.exitCode = report.counts.error ? 1 : 0
}

const usage = 'usage: node tools/film.mjs check|timing|retime|export <document> | frames <video> <outdir> [--document <document>]'
if (!target || (command !== 'frames' && !existsSync(join(WORKSPACE, target, 'lecture.json')))) {
  console.error(target ? `no ${target}/lecture.json in ${WORKSPACE}` : usage)
  process.exit(2)
}
switch (command) {
  case 'check': check(target); break
  case 'timing': await timing(target); break
  case 'retime': await retime(target); break
  case 'export': exportFilm(target); break
  case 'frames': if (!rest[0] || rest[0].startsWith('--')) { console.error(usage); process.exit(2) } await frames(target, rest[0]); break
  default: console.error(usage); process.exit(2)
}
