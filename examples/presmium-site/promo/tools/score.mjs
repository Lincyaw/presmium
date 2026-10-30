// The film's sound: an excerpt of "Newer Wave" (Kevin MacLeod, incompetech.com, CC BY 4.0) and three CC0 interface
// sounds (Kenney, `audio/sfx/`) on the visible presses, mixed and mastered with FFmpeg. Every time comes from the
// scenes' own clock (`scenes/timeline.ts`), so a retimed beat moves its sound with it.
//
//   node promo/tools/score.mjs
//
// Writes `audio/score.wav` (not committed), `audio/score.ogg` (Opus, what the document plays) and `audio/score.json`,
// then brings `lecture.json` up to date: the score's fingerprint, one music clip per step, the step holds and the
// scene's state durations. Needs FFmpeg with libopus; downloads the recording once into `audio/source/` (not committed).
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { END, MUSIC, ms, SOUNDS, STEPS, stepMs } from '../scenes/timeline.ts'

const promo = join(dirname(fileURLToPath(import.meta.url)), '..')
const audio = join(promo, 'audio')
const ffmpeg = (args, options = {}) => execFileSync('ffmpeg', ['-hide_banner', '-nostdin', ...args], { maxBuffer: 1 << 28, ...options })
/** Runs FFmpeg for its log (filters such as loudnorm and ebur128 report there). */
function ffmpegLog(args) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostdin', ...args], { maxBuffer: 1 << 28, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(run.stderr.slice(-2000))
  return run.stderr
}
const loudnormJson = log => JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/.exec(log)[0])
const TARGET = { lufs: -16, truePeak: -1.5 }
/** One level per kind of press (linear gain on the file's own level). */
const LEVEL = { click: 0.32, clicker: 0.3, tap: 0.36 }
/** The music ends on the last bar line, its last 0.3 s faded. */
const FADE_OUT = 0.3

// The recording, once.
const source = join(audio, 'source', 'newer-wave.mp3')
if (!existsSync(source)) {
  mkdirSync(dirname(source), { recursive: true })
  const response = await fetch(MUSIC.url)
  if (!response.ok) throw new Error(`could not download ${MUSIC.url}: ${response.status}`)
  writeFileSync(source, Buffer.from(await response.arrayBuffer()))
}

/** Seconds from a file's start to its attack (the first sample at half its peak), so the attack lands on the press. */
function attack(file) {
  const pcm = ffmpeg(['-i', file, '-f', 'f32le', '-ac', '1', '-ar', '48000', '-'], { stdio: ['ignore', 'pipe', 'ignore'] })
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4)
  let peak = 0
  for (const v of samples) peak = Math.max(peak, Math.abs(v))
  const i = samples.findIndex(v => Math.abs(v) >= peak / 2)
  return i / 48000
}
const sfx = Object.fromEntries(Object.keys(LEVEL).map(kind => { const file = join(audio, 'sfx', `${kind}.ogg`); return [kind, { file, attack: attack(file) }] }))

// The mix: the excerpt, then each press delayed to its time, all summed without normalization.
const inputs = ['-i', source, ...SOUNDS.flatMap(sound => ['-i', sfx[sound.kind].file])]
const music = `[0:a]atrim=start=${MUSIC.from}:duration=${END},asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,afade=t=in:d=0.005,afade=t=out:st=${END - FADE_OUT}:d=${FADE_OUT}[m]`
const presses = SOUNDS.map((sound, i) => {
  const delay = Math.max(0, Math.round((sound.at - sfx[sound.kind].attack) * 1000))
  return `[${i + 1}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${LEVEL[sound.kind]},adelay=${delay}:all=1[s${i}]`
})
const mix = `${[music, ...presses].join(';')};[m]${SOUNDS.map((_, i) => `[s${i}]`).join('')}amix=inputs=${SOUNDS.length + 1}:normalize=0:duration=first[mix]`

// Mastering in two passes: measure, then one linear gain to the target loudness under the true-peak ceiling.
const measured = loudnormJson(ffmpegLog([...inputs, '-filter_complex', `${mix};[mix]loudnorm=I=${TARGET.lufs}:TP=${TARGET.truePeak}:LRA=20:print_format=json[o]`, '-map', '[o]', '-f', 'null', '-']))
const wav = join(audio, 'score.wav'), ogg = join(audio, 'score.ogg')
const master = `loudnorm=I=${TARGET.lufs}:TP=${TARGET.truePeak}:LRA=20:linear=true:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:print_format=json,aresample=48000`
const second = ffmpegLog(['-y', ...inputs, '-filter_complex', `${mix};[mix]${master}[o]`, '-map', '[o]', '-t', String(END), '-c:a', 'pcm_s16le', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', wav])
const normalization = /"normalization_type"\s*:\s*"(\w+)"/.exec(second)?.[1]
ffmpeg(['-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libopus', '-b:a', '160k', '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', ogg])

// What came out, measured on the file the document plays.
const report = ffmpegLog(['-i', ogg, '-af', 'ebur128=peak=true', '-f', 'null', '-'])
const summary = report.slice(report.lastIndexOf('Summary:'))
const loudness = { integratedLufs: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]), truePeakDbtp: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]), lra: Number(/LRA:\s+(-?[\d.]+) LU/.exec(summary)?.[1]), normalization }
const fingerprint = `sha256:${createHash('sha256').update(readFileSync(ogg)).digest('hex')}`
writeFileSync(join(audio, 'score.json'), `${JSON.stringify({
  title: 'Make complex things clear · score',
  music: { ...MUSIC, credit: `Music: "${MUSIC.title}" by ${MUSIC.author} (incompetech.com). Licensed under Creative Commons: By Attribution 4.0 License, http://creativecommons.org/licenses/by/4.0/`, excerpt: { from: MUSIC.from, seconds: END, fadeOutSeconds: FADE_OUT } },
  effects: { pack: 'Kenney Interface Sounds 1.0 (CC0), https://kenney.nl/assets/interface-sounds', levels: LEVEL, attacks: Object.fromEntries(Object.entries(sfx).map(([kind, s]) => [kind, Number(s.attack.toFixed(4))])) },
  presses: SOUNDS.map(sound => ({ at: Number(sound.at.toFixed(4)), kind: sound.kind })),
  target: TARGET,
  measured: loudness,
  fingerprint,
}, null, 2)}\n`)

// The document follows: one clip of the score per step (a clip lies within its step), the holds and the durations.
const lecturePath = join(promo, 'lecture.json')
const lecture = JSON.parse(readFileSync(lecturePath, 'utf8'))
lecture.assets['film-score'].fingerprint = fingerprint
lecture.production.stepOverrides = Object.fromEntries(STEPS.map(step => [step.id, { minimumHoldMs: stepMs(step), trailingPauseMs: 0 }]))
lecture.production.mediaClips = STEPS.map(step => ({
  id: `score-${step.id.replace(/-step$/, '')}`,
  assetId: 'film-score',
  sourceRange: { startMs: ms(step.from), endMs: ms(step.to) },
  attachment: { stepId: step.id, offsetMs: 0 },
  volume: 1,
  muted: false,
}))
for (const definition of Object.values(lecture.definitions)) {
  const block = Object.values(lecture.blocks).find(b => b.definitionId === definition.id)
  const steps = STEPS.filter(step => Object.values(lecture.steps).some(s => s.id === step.id && s.visuals.some(v => v.blockId === block?.id && v.visible)))
  definition.data.durations = definition.states.map(state => stepMs(steps.find(step => step.state === state.id)))
}
writeFileSync(lecturePath, `${JSON.stringify(lecture, null, 2)}\n`)
console.log(JSON.stringify({ ...loudness, seconds: END, presses: SOUNDS.length, fingerprint }))
