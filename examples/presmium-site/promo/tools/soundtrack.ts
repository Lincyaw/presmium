/**
 * Original score for “让想法，被看见”. Every sound is synthesized here; no samples or speech.
 * Run with Node's TypeScript support: node soundtrack.ts. All randomness is seeded.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SAMPLE_RATE = 48000
export const DURATION_SECONDS = 60
export const BPM = 120
export const PHASES = [
  { id: 'spark', from: 0, to: 4 },
  { id: 'fracture', from: 4, to: 10 },
  { id: 'connect', from: 10, to: 16 },
  { id: 'overshoot', from: 16, to: 24 },
  { id: 'focus', from: 24, to: 34 },
  { id: 'revisit', from: 34, to: 40 },
  { id: 'resolve', from: 40, to: 48 },
  { id: 'formats', from: 48, to: 54 },
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

  // One motif moves from suspended D minor to open F major; orchestration follows the nine shots.
  pad(0, 4.8, [50, 57, 64, 69], 0.023, 520)
  ;[74, 81, 76].forEach((note, i) => mallet(0.35 + i * 0.35, note, 0.025, [-0.3, 0.25, 0][i]!, 2.5))
  pad(3.3, 7.1, [38, 50, 57, 63, 64], 0.025, 460)
  ;[0, 0.75, 1.5, 2.25, 3.5, 4.25, 5.0].forEach((offset, i) => {
    bass(4 + offset, i % 3 === 2 ? 37 : 38, 0.65, 0.034)
    hat(4 + offset + 0.125, 0.012, 0x2317 + i, i % 2 ? -0.55 : 0.55)
  })
  whoosh(8.7, 1.3, 0.09, 0x943a, true, -0.18)
  impact(10, 0.14)
  mallet(10, 81, 0.043, 0.15, 0.7)
  pad(10.45, 6.2, [50, 57, 60, 64, 69], 0.031, 1050)
  for (let i = 0; i < 10; i++) {
    const at = 11 + i * 0.5
    if (i % 2 === 0) { bass(at, 38, 0.8, 0.032); kick(at, 0.055) }
    hat(at + 0.25, 0.008, 0x3cd0 + i, i % 2 ? -0.35 : 0.35)
    if (i % 2 === 0) mallet(at, [69, 72, 76, 74, 72][i / 2]!, 0.025, i % 4 ? -0.3 : 0.3)
  }

  pad(15.3, 9.2, [38, 50, 57, 60, 63, 64], 0.028, 680)
  for (let i = 0; i < 16; i++) {
    const at = 16 + i * 0.5
    bass(at, i % 4 === 3 ? 37 : 38, 0.4, 0.038)
    if (i % 2 === 0) kick(at, 0.064)
    hat(at + (i % 4 === 3 ? 0.125 : 0.25), 0.01, 0x7640 + i, i % 2 ? -0.55 : 0.55)
    if (i % 4 === 0) mallet(at, [74, 75, 79, 75][i / 4]!, 0.025, i % 8 ? -0.4 : 0.4, 1.1)
  }
  whoosh(22.7, 1.3, 0.085, 0xa913, true, 0.15)
  impact(24, 0.15)
  pad(24, 5, [50, 57, 60, 64, 69], 0.031, 1050)
  pad(28, 5, [46, 53, 57, 60, 65], 0.031, 1150)
  pad(32, 2.8, [48, 55, 60, 65, 67], 0.028, 850)
  for (let i = 0; i < 20; i++) {
    const at = 24 + i * 0.5
    if (i % 2 === 0) { bass(at, i < 8 ? 38 : i < 16 ? 34 : 36, 0.82, 0.036); kick(at, 0.062) }
    hat(at + 0.25, 0.008, 0x8720 + i, i % 2 ? -0.3 : 0.3)
    if (i % 2 === 0) mallet(at, [69, 72, 76, 74, 69, 72, 77, 76, 72, 67][i / 2]!, 0.025, i % 4 ? -0.3 : 0.3)
  }

  // The return gesture is musical: reversed fragments of the existing motif, then room to look.
  whoosh(33.5, 0.65, 0.06, 0x12e3, false, -0.2)
  pad(34, 6.5, [45, 52, 57, 64, 67], 0.025, 540)
  mallet(34.35, 76, 0.026, 0.35, 0.9, true)
  mallet(35.35, 72, 0.022, -0.35, 0.9, true)
  mallet(36.35, 69, 0.024, 0.2, 1.2, true)
  bass(34, 33, 1.3, 0.026); bass(37, 33, 1.3, 0.026)
  whoosh(38.9, 1.1, 0.06, 0x43c8, true, 0.18)

  impact(40, 0.12)
  pad(40, 8.8, [41, 53, 57, 60, 64, 67], 0.034, 1400)
  for (let i = 0; i < 16; i++) {
    const at = 40 + i * 0.5
    if (i % 2 === 0) { bass(at, 41, 0.86, 0.036); kick(at, 0.067) }
    hat(at + 0.25, 0.008, 0x8190 + i, i % 2 ? -0.38 : 0.38)
    if (i % 2 === 0) mallet(at, [74, 77, 81, 79, 76, 72, 69, 72][i / 2]!, 0.03, i % 4 ? -0.3 : 0.3, 2)
  }

  // Three matching accents carry the same motif through the three media, never three new songs.
  pad(48, 6.8, [50, 57, 60, 64, 69], 0.028, 1100)
  ;[74, 77, 81].forEach((note, i) => {
    const at = 48 + i * 2
    kick(at, 0.045); bass(at, 38, 1.2, 0.025)
    mallet(at + 0.035, note, 0.04, [-0.3, 0, 0.3][i]!, 2.5)
    whoosh(at - 0.25, 0.4, 0.024, 0x2364 + i, true, i % 2 ? -0.3 : 0.3)
  })

  // An original closing signature: open fifth, ninth, and a warm major-sixth room tail.
  impact(54, 0.09)
  pad(53.5, 6.5, [41, 53, 57, 60, 62, 67], 0.029, 1050)
  mallet(54.05, 62, 0.045, -0.2, 4.8)
  mallet(54.12, 69, 0.035, 0.2, 4.8)
  mallet(54.7, 76, 0.03, 0.05, 4.6)

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
    const breath = time < 10.15 ? 1 : time < 10.3 ? 1 - 0.94 * smooth((time - 10.15) / 0.15) : time < 10.45 ? 0.06 : time < 10.8 ? 0.06 + 0.94 * smooth((time - 10.45) / 0.35) : 1
    const master = smooth(time / 0.035) * smooth((DURATION_SECONDS - time) / 1.2) * breath
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
  const output = join(dirname(fileURLToPath(import.meta.url)), '..', 'audio', 'cinematic-score.wav')
  const channels = renderScore(), bytes = encodeWav(channels)
  mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, bytes)
  const windows = PHASES.map(phase => {
    let energy = 0, peak = 0
    for (const data of channels) for (let i = Math.round(phase.from * SAMPLE_RATE); i < Math.round(phase.to * SAMPLE_RATE); i++) { const v = data[i]!; energy += v * v; peak = Math.max(peak, Math.abs(v)) }
    return { ...phase, rms: Math.sqrt(energy / ((phase.to - phase.from) * SAMPLE_RATE * 2)), peak }
  })
  const manifest = { title: '让想法，被看见 · Original procedural score', originalComposition: true, speech: false, sampledRecordings: false, sampleRate: SAMPLE_RATE, channels: 2, bitDepth: 16, durationSeconds: DURATION_SECONDS, bpm: BPM, phases: windows, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }
  writeFileSync(output.replace(/\.wav$/, '.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(JSON.stringify({ output, ...manifest }))
}
