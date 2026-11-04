import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

/**
 * One PNG of the video's frames at the given times, `columns` to a row, each labelled at its top left. FFmpeg takes
 * every frame and tiles them (`tile`); the labels need its `drawtext` filter, without which the frames go unlabelled.
 */
export function writeContactSheet(ffmpeg: Ffmpeg, video: string, frames: readonly SheetFrame[], out: string, options: SheetOptions): { labelled: boolean } {
  const labelled = hasFilter(ffmpeg, 'drawtext')
  // The filters name only files of this folder, so no path needs escaping in a filter graph.
  const dir = mkdtempSync(join(tmpdir(), 'presmium-sheet-'))
  try {
    const size = Math.max(10, Math.round(options.width / 30))
    // A fontconfig pattern in place of a font file: the system's font for the document's language (CJK glyphs need it).
    const font = `:lang=${options.lang.toLowerCase().replace(/[^a-z0-9-]/g, '')}`
    frames.forEach((frame, index) => {
      const name = String(index).padStart(4, '0')
      let filter = `scale=${options.width}:-2`
      if (labelled) {
        writeFileSync(join(dir, `${name}.txt`), frame.label)
        filter += `,drawtext=textfile=${name}.txt:expansion=none:fontfile=\\'${font}\\':fontsize=${size}:fontcolor=black:box=1:boxcolor=yellow:boxborderw=${Math.round(size / 3)}:x=${Math.round(size / 2)}:y=${Math.round(size / 2)}`
      }
      runFfmpeg(ffmpeg, ['-ss', (frame.atMs / 1000).toFixed(3), '-i', video, '-frames:v', '1', '-vf', filter, `${name}.png`], dir)
    })
    const rows = Math.max(1, Math.ceil(frames.length / options.columns))
    runFfmpeg(ffmpeg, ['-framerate', '1', '-i', '%04d.png', '-vf', `tile=${options.columns}x${rows}:padding=4:margin=4:color=gray`, '-frames:v', '1', '-update', '1', out], dir)
    return { labelled }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
