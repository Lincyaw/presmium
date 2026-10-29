import { spawnSync } from 'node:child_process'

export interface Ffmpeg {
  /** The program, as it is run. */
  file: string
  /** The names of its encoders (`libx264`, `libvpx-vp9`, `aac`, `libopus`…). */
  encoders: Set<string>
}

let found: Ffmpeg | null | undefined

/**
 * FFmpeg as the author installed it: `PRESMIUM_FFMPEG`, else `ffmpeg` on the path; undefined when it does not run.
 * Presmium does not ship it; it encodes the lecture video with it when it is there (`ffmpegInstallHint` says how).
 */
export function findFfmpeg(): Ffmpeg | undefined {
  if (found !== undefined) return found ?? undefined
  const file = process.env.PRESMIUM_FFMPEG || 'ffmpeg'
  const run = spawnSync(file, ['-hide_banner', '-encoders'], { encoding: 'utf8', timeout: 10_000 })
  found = run.status === 0 ? { file, encoders: new Set([...run.stdout.matchAll(/^ [A-Z.]{6} (\S+)/gm)].map(m => m[1]!)) } : null
  return found ?? undefined
}

/** The one command that installs FFmpeg on this system. */
export function ffmpegInstallCommand(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') return 'brew install ffmpeg'
  if (platform === 'win32') return 'winget install --id Gyan.FFmpeg'
  return 'sudo apt install ffmpeg'
}
