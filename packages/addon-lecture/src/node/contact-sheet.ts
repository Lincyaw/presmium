import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Ffmpeg } from '@lincyaw/kernel/node'

export interface SheetFrame {
  atMs: number
  label: string
}

export interface SheetOptions {
  /** The document's language: the labels' font is the system's sans-serif for it. */
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

/**
 * One PNG of the video's frames at the given times, `columns` to a row, each labelled at its top left. FFmpeg reads the
 * video once and keeps the frames shown at those times (`select` by frame number), then labels and tiles them
 * (`drawtext` per frame, `tile`); without `drawtext` the frames go unlabelled.
 */
export function writeContactSheet(ffmpeg: Ffmpeg, video: string, frames: readonly SheetFrame[], out: string, options: SheetOptions): { labelled: boolean } {
  const labelled = hasFilter(ffmpeg, 'drawtext')
  // The filters name only files of this folder, so no path needs escaping in a filter graph.
  const dir = mkdtempSync(join(tmpdir(), 'presmium-sheet-'))
  try {
    const numbers = frames.map(frame => Math.max(0, Math.floor(frame.atMs * options.fps / 1000 + 1e-6)))
    const taken = [...new Set(numbers)].sort((a, b) => a - b)
    // `setpts` makes the kept frames consecutive, so that each is written once without `-fps_mode` (FFmpeg 5.1 and later).
    runFfmpeg(ffmpeg, ['-i', video, '-an', '-sn', '-vf', `select='${taken.map(n => `eq(n,${n})`).join('+')}',setpts=N/FRAME_RATE/TB,scale=${options.width}:-2`, '-start_number', '0', 'taken%04d.png'], dir)
    const missing = taken.findIndex((_, index) => !existsSync(join(dir, `${numbered('taken', index)}.png`)))
    if (missing >= 0) throw new Error(`ffmpeg took ${missing} of the ${taken.length} frames asked for from ${video}`)
    // Two times can fall on one frame: each place on the sheet gets its own copy.
    numbers.forEach((n, index) => copyFileSync(join(dir, `${numbered('taken', taken.indexOf(n))}.png`), join(dir, `${numbered('', index)}.png`)))
    const size = Math.max(10, Math.round(options.width / 30))
    // A fontconfig pattern in place of a font file: the system's font for the document's language (CJK glyphs need it).
    const font = `:lang=${options.lang.toLowerCase().replace(/[^a-z0-9-]/g, '')}`
    const labels = labelled ? frames.map((frame, index) => {
      writeFileSync(join(dir, `${numbered('', index)}.txt`), frame.label)
      return `drawtext=textfile=${numbered('', index)}.txt:expansion=none:fontfile=\\'${font}\\':fontsize=${size}:fontcolor=black:box=1:boxcolor=yellow:boxborderw=${Math.round(size / 3)}:x=${Math.round(size / 2)}:y=${Math.round(size / 2)}:enable='eq(n,${index})'`
    }) : []
    const rows = Math.max(1, Math.ceil(frames.length / options.columns))
    runFfmpeg(ffmpeg, ['-framerate', '1', '-i', '%04d.png', '-vf', [...labels, `tile=${options.columns}x${rows}:padding=4:margin=4:color=gray`].join(','), '-frames:v', '1', '-update', '1', out], dir)
    return { labelled }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
