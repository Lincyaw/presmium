/**
 * Original score for “难讲的课，也能讲明白”. Every sound is synthesized here; no samples or speech.
 * Run with Node's TypeScript support: node soundtrack.ts. All randomness is seeded.
 * The cues follow the film's ten shots (`PHASES`, the sections of `lecture.json`) and the moments inside them.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SAMPLE_RATE = 48000
export const DURATION_SECONDS = 60
export const BPM = 120
export const PHASES = [
  { id: 'question', from: 0, to: 6 },
  { id: 'board', from: 6, to: 11 },
  { id: 'ask', from: 11, to: 19 },
  { id: 'done', from: 19, to: 26 },
  { id: 'forms', from: 26, to: 29 },
  { id: 'lesson', from: 29, to: 39 },
  { id: 'website', from: 39, to: 44.5 },
  { id: 'video', from: 44.5, to: 50.5 },
  { id: 'reply', from: 50.5, to: 54 },
  { id: 'brand', from: 54, to: 60 },
] as const

const TAU = Math.PI * 2
const clamp = (x: number) => Math.max(0, Math.min(1, x))
const smooth = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t) }
const hz = (note: number) => 440 * 2 ** ((note - 69) / 12)
const envelope = (t: number, duration: number, attack: number, release: number) => smooth(t / attack) * smooth((duration - t) / release)
function noise(seed: number) {
  let state = seed >>> 0
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x100000000 * 2 - 1 }
}

export function renderScore(sampleRate = SAMPLE_RATE): [Float32Array, Float32Array] {
  const count = Math.round(DURATION_SECONDS * sampleRate)
  const left = new Float32Array(count), right = new Float32Array(count)
  const add = (at: number, duration: number, pan: number, draw: (t: number) => number) => {
    const start = Math.round(at * sampleRate), end = Math.min(count, start + Math.round(duration * sampleRate))
    const l = Math.cos((pan + 1) * Math.PI / 4), r = Math.sin((pan + 1) * Math.PI / 4)
    for (let i = start; i < end; i++) { const v = draw((i - start) / sampleRate); left[i] = left[i]! + v * l; right[i] = right[i]! + v * r }
  }
  const pad = (at: number, duration: number, notes: number[], gain: number, brightness = 700) => {
    notes.forEach((note, index) => {
      const f = hz(note), pan = (index / Math.max(1, notes.length - 1) - 0.5) * 1.5
      let low = 0
      add(at, duration, pan, t => {
        const p = TAU * f * t
        const detune = (Math.sin(p * 0.9979 + index * 0.37) + Math.sin(p) + Math.sin(p * 1.0023 - index * 0.29)) / 3
        const raw = detune + 0.19 * Math.sin(p * 2 + 0.3) + 0.075 * Math.sin(p * 3)
        const cutoff = brightness * (0.72 + 0.28 * Math.sin(TAU * 0.067 * t + index))
        low += (1 - Math.exp(-TAU * cutoff / sampleRate)) * (raw - low)
        return low * envelope(t, duration, 0.9, 1.4) * (0.93 + 0.07 * Math.sin(TAU * 0.15 * t + index)) * gain
      })
    })
  }
  const bass = (at: number, note: number, duration: number, gain: number) => {
    const f = hz(note)
    add(at, duration, 0, t => {
      const p = TAU * f * t
      return (Math.sin(p) + 0.22 * Math.sin(p * 2) + 0.07 * Math.sin(p * 3)) * envelope(t, duration, 0.018, 0.14) * Math.exp(-t / 0.65) * gain
    })
  }
  const mallet = (at: number, note: number, gain: number, pan: number, duration = 1.8, reverse = false) => {
    const f = hz(note)
    add(at, duration, pan, time => {
      const t = reverse ? duration - time : time, p = TAU * f * t
      const body = Math.sin(p + 1.15 * Math.sin(p * 2) * Math.exp(-t / 0.06)) + 0.16 * Math.sin(p * 3.002) * Math.exp(-t / 0.2)
      return body * Math.exp(-t / 0.52) * envelope(t, duration, 0.005, 0.07) * gain
    })
  }
  const kick = (at: number, gain: number) => add(at, 0.32, 0, t => {
    const p = TAU * (43 * t + 57 * 0.023 * (1 - Math.exp(-t / 0.023)))
    return Math.sin(p) * smooth(t / 0.003) * Math.exp(-t / 0.075) * gain
  })
  const hat = (at: number, gain: number, seed: number, pan: number) => {
    const random = noise(seed); let low = 0
    add(at, 0.11, pan, t => { const v = random(); low += 0.23 * (v - low); return (v - low) * Math.exp(-t / 0.023) * smooth(t / 0.001) * gain })
  }
  const whoosh = (at: number, duration: number, gain: number, seed: number, rising: boolean, pan: number) => {
    const random = noise(seed); let low = 0, band = 0
    add(at, duration, pan, t => {
      const p = t / duration, raw = random()
      low += 0.018 * (raw - low)
      const cutoff = 400 + 3600 * (rising ? p * p : (1 - p) ** 2)
      band += (1 - Math.exp(-TAU * cutoff / sampleRate)) * (raw - low - band)
      return band * Math.sin(Math.PI * p) ** 1.5 * gain
    })
  }
  const impact = (at: number, gain: number) => {
    kick(at, gain)
    const random = noise(0x1728 + Math.round(at * 100)); let low = 0
    add(at, 0.28, 0, t => { low += 0.055 * (random() - low); return low * Math.exp(-t / 0.06) * smooth(t / 0.002) * gain * 0.7 })
  }

  /** A soft tick for a press on the screen; a short fast series of them reads as typing. */
  const tick = (at: number, gain: number, seed: number, pan = 0.2) => {
    const random = noise(seed); let low = 0
    add(at, 0.05, pan, t => { const v = random(); low += 0.5 * (v - low); return (v - low) * Math.exp(-t / 0.008) * gain })
  }
  /** The phone's buzz: a low tone chopped by a fast tremolo. */
  const buzz = (at: number, duration: number, gain: number) => add(at, duration, 0, t =>
    Math.sin(TAU * 150 * t) * (0.5 + 0.5 * Math.sign(Math.sin(TAU * 32 * t))) * envelope(t, duration, 0.01, 0.04) * gain)
  /** One bar of the groove from `at`: kick and bass on the beats, a hat between them. */
  const groove = (at: number, beats: number, root: number, kickGain: number, hatGain: number, seed: number) => {
    for (let i = 0; i < beats; i++) {
      const t = at + i * 0.5
      if (kickGain) kick(t, kickGain)
      if (i % 2 === 0) bass(t, root, 0.8, 0.032)
      hat(t + 0.25, hatGain, seed + i, i % 2 ? -0.4 : 0.4)
    }
  }

  // Question (0–6): a dark D minor room; the phone buzzes, the message arrives on a two-note chime.
  pad(0, 6.6, [50, 57, 62, 65], 0.022, 480)
  bass(0, 38, 2.8, 0.02); bass(3, 38, 2.8, 0.02)
  buzz(0.6, 0.32, 0.03)
  mallet(2.15, 81, 0.032, 0.25, 2.2)
  mallet(2.33, 76, 0.026, -0.2, 2.2)

  // Board (6–11): a slow pulse under three chalk tries that never resolve, two rubs of the eraser.
  pad(5.8, 5.6, [50, 57, 60, 65], 0.024, 430)
  for (let i = 0; i < 7; i++) bass(6 + i * 0.75, i % 3 === 2 ? 37 : 38, 0.6, 0.026)
  ;[[6.7, 69], [7.65, 70], [8.5, 72]].forEach(([at, note], i) => mallet(at!, note!, 0.024, [-0.3, 0.3, 0][i]!, 1.3))
  whoosh(7.4, 0.6, 0.035, 0x51a7, false, -0.2)
  whoosh(8.3, 0.6, 0.035, 0x51b9, false, 0.2)
  mallet(9.05, 70, 0.02, 0.35, 1.6, true)
  whoosh(10.1, 0.9, 0.06, 0x7311, true, 0)

  // Ask (11–19): the turn to F major, “this time, another way”. A light pulse; ticks for the presses and typing.
  impact(11, 0.08)
  pad(10.9, 8.4, [41, 53, 57, 60, 67], 0.03, 1000)
  for (let i = 0; i < 15; i++) {
    const at = 11.5 + i * 0.5
    if (i % 2 === 0) bass(at, 41, 0.8, 0.03)
    hat(at + 0.25, 0.007, 0x3c10 + i, i % 2 ? -0.35 : 0.35)
    if (i % 2 === 0) mallet(at, [72, 76, 79, 77, 76, 72, 74, 77][i / 2]!, 0.022, i % 4 ? -0.3 : 0.3, 1.4)
  }
  tick(12.85, 0.03, 0x11, -0.1); tick(13.9, 0.035, 0x12)
  for (let i = 0; i < 18; i++) tick(14.15 + i * 0.125, 0.012, 0x40 + i, (i % 3 - 1) * 0.3)
  tick(16.9, 0.035, 0x13)

  // Done (19–26): the request is sent, a rising breath, and the revision lands; the preview's steps climb.
  pad(19, 7.4, [41, 53, 57, 60, 64], 0.028, 1100)
  groove(19, 3, 41, 0.04, 0.007, 0x5100)
  tick(19.6, 0.03, 0x14); tick(20.65, 0.035, 0x15)
  whoosh(20.75, 1.1, 0.07, 0x9a12, true, 0.1)
  impact(21.85, 0.11)
  mallet(21.85, 77, 0.035, -0.2, 2.4); mallet(21.9, 81, 0.03, 0.2, 2.4)
  groove(22, 8, 41, 0.05, 0.008, 0x5200)
  ;[[24.1, 76], [24.65, 79], [25.2, 83]].forEach(([at, note], i) => { tick(at!, 0.03, 0x20 + i); mallet(at! + 0.05, note!, 0.032, (i - 1) * 0.3, 1.2) })

  // Forms (26–29): one lesson opens into three; three bright notes, close together, on an open chord.
  pad(26, 3.4, [41, 53, 60, 65, 69], 0.026, 1300)
  ;[74, 77, 81].forEach((note, i) => { mallet(26.85 + i * 0.12, note, 0.034, (i - 1) * 0.4, 2.2); whoosh(26.7 + i * 0.12, 0.3, 0.02, 0x2364 + i, true, (i - 1) * 0.4) })
  bass(26.85, 41, 1.6, 0.03)

  // Lesson (29–39): the groove of the class. Learning rate 2.2 climbs out of key with each press and hangs on
  // B-flat; 0.35 walks back down and comes home to F, and the room answers.
  groove(29.5, 6, 41, 0.055, 0.008, 0x6100)
  ;[[30.5, 76], [31.4, 80], [32.3, 83]].forEach(([at, note], i) => { tick(at!, 0.03, 0x30 + i); mallet(at! + 0.05, note!, 0.03 + i * 0.006, (i - 1) * 0.35, 1.3) })
  pad(32.3, 2, [46, 53, 58, 62, 68], 0.03, 700)
  groove(32.5, 3, 46, 0.045, 0.006, 0x6200)
  ;[[34.0, 81], [34.6, 79], [35.2, 77], [35.8, 76], [36.4, 77]].forEach(([at, note], i) => { tick(at!, 0.028, 0x38 + i); mallet(at! + 0.05, note!, 0.03, (i % 2 ? -0.3 : 0.3), 1.4) })
  groove(34, 10, 41, 0.055, 0.008, 0x6300)
  pad(34, 5.4, [41, 53, 57, 60, 65], 0.03, 1200)
  mallet(37.0, 81, 0.035, -0.2, 2.6); mallet(37.08, 84, 0.028, 0.25, 2.6)

  // Website (39–44.5): after class, quieter: no kick, the motif slower.
  pad(39, 5.9, [41, 53, 57, 60, 64], 0.027, 950)
  for (let i = 0; i < 11; i++) {
    const at = 39 + i * 0.5
    if (i % 2 === 0) bass(at, i < 6 ? 41 : 38, 0.8, 0.026)
    hat(at + 0.25, 0.006, 0x7100 + i, i % 2 ? -0.3 : 0.3)
    if (i % 4 === 0) mallet(at, [72, 76, 74][i / 4]!, 0.022, i % 8 ? -0.3 : 0.3, 1.8)
  }

  // Video (44.5–50.5): sent to the group; the tap opens it; dragging back plays the motif backwards.
  pad(44.5, 6.4, [46, 53, 57, 62, 65], 0.027, 1000)
  groove(44.5, 8, 46, 0.04, 0.007, 0x8100)
  mallet(45.05, 77, 0.03, 0.2, 1.6)
  tick(46.2, 0.035, 0x50)
  whoosh(46.3, 0.4, 0.035, 0x8a01, true, 0)
  mallet(48.55, 76, 0.026, 0.35, 0.7, true); mallet(48.8, 72, 0.024, -0.35, 0.7, true); mallet(49.05, 69, 0.024, 0.2, 0.8, true)
  groove(49.3, 2, 46, 0.04, 0.007, 0x8200)

  // Reply (50.5–54): the drums stop; the answer arrives on a warm chord.
  pad(50.4, 3.9, [41, 53, 57, 60, 64, 69], 0.03, 1100)
  bass(51.35, 41, 2.2, 0.03)
  ;[77, 81, 84].forEach((note, i) => mallet(51.35 + i * 0.06, note, 0.03, (i - 1) * 0.3, 2.6))

  // Brand (54–60): an open fifth, a ninth, and a warm room tail.
  impact(54.1, 0.08)
  pad(53.7, 6.3, [41, 53, 57, 60, 62, 67], 0.028, 1050)
  mallet(54.15, 62, 0.045, -0.2, 4.8)
  mallet(54.22, 69, 0.035, 0.2, 4.8)
  mallet(55.0, 76, 0.03, 0.05, 4.6)

  const delays = [0.0297, 0.0371, 0.0411, 0.0437]
  const rings = delays.map((seconds, i) => ({ l: new Float32Array(Math.round(seconds * sampleRate)), r: new Float32Array(Math.round((seconds + (i % 2 ? -0.0011 : 0.0013)) * sampleRate)), lpL: 0, lpR: 0 }))
  for (let i = 0; i < count; i++) {
    let wetL = 0, wetR = 0
    for (const ring of rings) {
      const il = i % ring.l.length, ir = i % ring.r.length, l = ring.l[il]!, r = ring.r[ir]!
      ring.lpL += 0.21 * (l - ring.lpL); ring.lpR += 0.21 * (r - ring.lpR)
      ring.l[il] = left[i]! * 0.2 + ring.lpR * 0.7; ring.r[ir] = right[i]! * 0.2 + ring.lpL * 0.7
      wetL += l; wetR += r
    }
    const time = i / sampleRate
    const master = smooth(time / 0.035) * smooth((DURATION_SECONDS - time) / 1.2)
    left[i] = Math.tanh((left[i]! + wetL * 0.22) * 1.2) * master
    right[i] = Math.tanh((right[i]! + wetR * 0.22) * 1.2) * master
  }
  let peak = 0
  for (let i = 0; i < count; i++) peak = Math.max(peak, Math.abs(left[i]!), Math.abs(right[i]!))
  const scale = peak ? 0.82 / peak : 1
  for (let i = 0; i < count; i++) { left[i] = left[i]! * scale; right[i] = right[i]! * scale }
  return [left, right]
}

export function encodeWav(channels: readonly Float32Array[], sampleRate = SAMPLE_RATE): Buffer {
  const frames = channels[0]!.length, channelCount = channels.length, bytes = frames * channelCount * 2
  const out = Buffer.alloc(44 + bytes)
  out.write('RIFF', 0); out.writeUInt32LE(36 + bytes, 4); out.write('WAVE', 8)
  out.write('fmt ', 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20)
  out.writeUInt16LE(channelCount, 22); out.writeUInt32LE(sampleRate, 24)
  out.writeUInt32LE(sampleRate * channelCount * 2, 28); out.writeUInt16LE(channelCount * 2, 32); out.writeUInt16LE(16, 34)
  out.write('data', 36); out.writeUInt32LE(bytes, 40)
  for (let i = 0; i < frames; i++) for (let channel = 0; channel < channelCount; channel++) { const v = Math.max(-1, Math.min(1, channels[channel]![i]!)); out.writeInt16LE(Math.round(v * (v < 0 ? 32768 : 32767)), 44 + (i * channelCount + channel) * 2) }
  return out
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = join(dirname(fileURLToPath(import.meta.url)), '..', 'audio', 'score.wav')
  const channels = renderScore(), bytes = encodeWav(channels)
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, bytes)
  const windows = PHASES.map(phase => {
    let energy = 0, peak = 0
    for (const data of channels) for (let i = Math.round(phase.from * SAMPLE_RATE); i < Math.round(phase.to * SAMPLE_RATE); i++) { const v = data[i]!; energy += v * v; peak = Math.max(peak, Math.abs(v)) }
    return { ...phase, rms: Math.sqrt(energy / ((phase.to - phase.from) * SAMPLE_RATE * 2)), peak }
  })
  const manifest = { title: '难讲的课，也能讲明白 · 原创配乐', originalComposition: true, speech: false, sampledRecordings: false, sampleRate: SAMPLE_RATE, channels: 2, bitDepth: 16, durationSeconds: DURATION_SECONDS, bpm: BPM, phases: windows, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  writeFileSync(output.replace(/\.wav$/, '.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ output, ...manifest }))
}
