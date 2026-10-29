import { spawn } from 'node:child_process'
import { once } from 'node:events'
import type { Ffmpeg } from '@lincyaw/kernel/node'

export type VideoFormat = 'mp4' | 'webm'

const ENCODERS: Record<VideoFormat, string[]> = { mp4: ['libx264', 'aac'], webm: ['libvpx-vp9', 'libopus'] }

export function videoFormat(file: string): VideoFormat {
  return file.toLowerCase().endsWith('.webm') ? 'webm' : 'mp4'
}

/** Whether this FFmpeg has the encoders of the format. */
export function ffmpegEncodes(ffmpeg: Ffmpeg, format: VideoFormat): boolean {
  return ENCODERS[format].every(name => ffmpeg.encoders.has(name))
}

export interface FfmpegVideo {
  out: string
  fps: number
  /** 16-bit stereo PCM at 48 kHz, the whole lecture's sound. */
  audio?: string
  subtitles: { file: string, name: string, language?: string }[]
  metadata: Record<string, string>
}

export interface FfmpegEncoder {
  frame(png: Buffer): Promise<void>
  finish(): Promise<void>
  kill(): void
}

/** An FFmpeg process that takes the frames as PNG on its input and writes the video with its sound and subtitle tracks. */
export function startFfmpeg(ffmpeg: Ffmpeg, video: FfmpegVideo): FfmpegEncoder {
  const format = videoFormat(video.out)
  const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(video.fps), '-i', '-']
  if (video.audio) args.push('-f', 's16le', '-ar', '48000', '-ac', '2', '-i', video.audio)
  for (const { file } of video.subtitles) args.push('-i', file)
  args.push('-map', '0:v')
  if (video.audio) args.push('-map', '1:a')
  video.subtitles.forEach((_, i) => args.push('-map', `${i + (video.audio ? 2 : 1)}:s`))
  // Even sides for 4:2:0; slides are text, so the quality is set by a constant rate factor rather than a bitrate.
  args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p', '-g', String(Math.round(video.fps * 10)))
  if (format === 'mp4') args.push('-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-c:s', 'mov_text', '-movflags', '+faststart+use_metadata_tags')
  else args.push('-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0', '-deadline', 'good', '-cpu-used', '2', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '128k', '-c:s', 'webvtt')
  video.subtitles.forEach(({ name, language }, i) => {
    if (language) args.push(`-metadata:s:s:${i}`, `language=${language}`)
    args.push(`-metadata:s:s:${i}`, `title=${name}`)
  })
  for (const [key, value] of Object.entries(video.metadata)) args.push('-metadata', `${key}=${value}`)
  args.push(video.out)

  const child = spawn(ffmpeg.file, args, { stdio: ['pipe', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.setEncoding('utf8').on('data', (text: string) => { stderr = (stderr + text).slice(-4000) })
  child.stdin.on('error', () => {})
  const exited = new Promise<void>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`ffmpeg stopped (${code ?? signal}): ${stderr.trim() || 'no message'}`)))
  })
  exited.catch(() => {})
  return {
    async frame(png) {
      if (child.exitCode !== null || !child.stdin.writable) return exited
      if (!child.stdin.write(png)) await Promise.race([once(child.stdin, 'drain'), exited])
    },
    async finish() {
      child.stdin.end()
      await exited
    },
    kill() {
      if (child.exitCode === null) child.kill('SIGKILL')
    },
  }
}
