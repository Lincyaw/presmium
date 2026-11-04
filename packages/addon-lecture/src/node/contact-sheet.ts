import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Ffmpeg } from '@lincyaw/kernel/node'

export interface SheetFrame {
  atMs: number
  label: string
}

export interface SheetOptions {
  /** The document's language, which shapes the labels' text. */
  lang: string
  /** The width of a frame in the image. */
  width: number
  columns: number
  /** The video's frame rate: the export writes frame `n` at `n / fps` seconds. */
  fps: number
}

const filters = new Map<string, boolean>()

function hasFilter(ffmpeg: Ffmpeg, name: string): boolean {
  const key = `${ffmpeg.file}\0${name}`
  let found = filters.get(key)
  if (found === undefined) {
    const run = spawnSync(ffmpeg.file, ['-hide_banner', '-filters'], { encoding: 'utf8', timeout: 10_000 })
    filters.set(key, found = run.status === 0 && new RegExp(`^\\s*\\S+\\s+${name}\\s`, 'm').test(run.stdout))
  }
  return found
}

function runFfmpeg(ffmpeg: Ffmpeg, args: string[], cwd: string): void {
  const run = spawnSync(ffmpeg.file, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { cwd, encoding: 'utf8' })
  if (run.status !== 0) throw new Error(`ffmpeg stopped (${run.status ?? run.signal}): ${run.stderr.trim().slice(-2000) || 'no message'}`)
}

const numbered = (prefix: string, index: number) => `${prefix}${String(index).padStart(4, '0')}`

/** `select`'s test for the frames numbered `numbers`, summed as a balanced tree: FFmpeg's expressions nest only so deep. */
function anyFrame(numbers: readonly number[]): string {
  if (numbers.length === 0) throw new Error('a contact sheet needs at least one frame')
  if (numbers.length === 1) return `eq(n,${numbers[0]})`
  const half = numbers.length >> 1
  return `(${anyFrame(numbers.slice(0, half))})+(${anyFrame(numbers.slice(half))})`
}

/** An ASS time, H:MM:SS.cc. */
const assTime = (seconds: number) => `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.00`

/**
 * The labels as one ASS script, the label of frame `i` shown from second `i` (the frames are read at one a second): a
 * black line on a yellow box at the top left. Braces and backslashes would be ASS markup, so they become their
 * full-width forms.
 */
function labelScript(frames: readonly SheetFrame[], lang: string, width: number, height: number): string {
  // An ASS font size is the line's height, about 1.4 times the letters'.
  const size = Math.max(14, Math.round(width / 26)), margin = Math.round(size / 3)
  const text = (label: string) => label.replace(/\s+/g, ' ').replace(/[{}\\]/g, ch => String.fromCharCode(ch.charCodeAt(0) + 0xfee0))
  return [
    '[Script Info]', 'ScriptType: v4.00+', `PlayResX: ${width}`, `PlayResY: ${height}`, 'WrapStyle: 2', `Language: ${lang}`, '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Label,sans-serif,${size},&H00000000,&H00000000,&H0000FFFF,&H0000FFFF,0,0,0,0,100,100,0,0,3,${Math.round(size / 4)},0,7,${margin},${margin},${margin},1`, '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...frames.map((frame, index) => `Dialogue: 0,${assTime(index)},${assTime(index + 1)},Label,,0,0,0,,${text(frame.label)}`), '',
  ].join('\n')
}

/** The width and height of a PNG file, from its header. */
function pngSize(file: string): { width: number, height: number } {
  const header = readFileSync(file).subarray(16, 24)
  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) }
}

/**
 * One PNG of the video's frames at the given times, `columns` to a row, each labelled at its top left. FFmpeg reads the
 * video once and keeps the frames shown at those times (`select` by frame number), then labels them with one ASS script
 * (libass, its `ass` filter) and tiles them (`tile`); without `ass` the frames go unlabelled.
 */
export function writeContactSheet(ffmpeg: Ffmpeg, video: string, frames: readonly SheetFrame[], out: string, options: SheetOptions): { labelled: boolean } {
  const labelled = hasFilter(ffmpeg, 'ass')
  // The filters name only files of this folder, so no path needs escaping in a filter graph.
  const dir = mkdtempSync(join(tmpdir(), 'presmium-sheet-'))
  try {
    const numbers = frames.map(frame => Math.max(0, Math.floor(frame.atMs * options.fps / 1000 + 1e-6)))
    const taken = [...new Set(numbers)].sort((a, b) => a - b)
    // `setpts` makes the kept frames consecutive, so that each is written once without `-fps_mode` (FFmpeg 5.1 and later).
    runFfmpeg(ffmpeg, ['-i', video, '-an', '-sn', '-vf', `select='${anyFrame(taken)}',setpts=N/FRAME_RATE/TB,scale=${options.width}:-2`, '-start_number', '0', 'taken%04d.png'], dir)
    const missing = taken.findIndex((_, index) => !existsSync(join(dir, `${numbered('taken', index)}.png`)))
    if (missing >= 0) throw new Error(`ffmpeg took ${missing} of the ${taken.length} frames asked for from ${video}`)
    // Two times can fall on one frame: each place on the sheet gets its own copy.
    numbers.forEach((n, index) => copyFileSync(join(dir, `${numbered('taken', taken.indexOf(n))}.png`), join(dir, `${numbered('', index)}.png`)))
    const labels: string[] = []
    if (labelled) {
      const { width, height } = pngSize(join(dir, `${numbered('taken', 0)}.png`))
      writeFileSync(join(dir, 'labels.ass'), labelScript(frames, options.lang, width, height))
      labels.push('ass=labels.ass')
    }
    const rows = Math.max(1, Math.ceil(frames.length / options.columns))
    runFfmpeg(ffmpeg, ['-framerate', '1', '-i', '%04d.png', '-vf', [...labels, `tile=${options.columns}x${rows}:padding=4:margin=4:color=gray`].join(','), '-frames:v', '1', '-update', '1', out], dir)
    return { labelled }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
