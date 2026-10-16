/**
 * `presmium-lecture` (docs/architecture.md section 7): `export` renders a
 * lecture of a deck to a video file (P-135, ./export.ts). Exit codes as in
 * `presmium`: 0 done, 2 usage or a failure.
 */
import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { DECK_ENTRY } from '@presmium/compiler'
import { errorMessage } from '@presmium/kernel'
import { clockText } from '../domain/index.ts'
import { exportVideo } from './export.ts'

const USAGE = `Usage: presmium-lecture export [deckDir] [--track <id>] [--out <file.webm>] [--size <width>x<height>] [--fps <n>]

Builds the deck's web form and lectures, plays the lecture in Chromium
(playwright-chromium) a frame at a time and writes it with its audio as a
WebM video (VP9 or VP8, Opus). --track names the lecture (default: the
synthesized one, else the only recorded one); --out the file (default
<deckDir>/dist/<track>.webm); --size the window (default 1280x720); --fps the
frames a second (default 10). MP4 is not written: see docs/design-v0.7.md 11.`

function shown(file: string): string {
  const rel = relative(process.cwd(), file)
  return rel.startsWith('..') || isAbsolute(rel) ? file : rel
}

export async function lectureMain(argv: string[]): Promise<number> {
  let args
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { track: { type: 'string' }, out: { type: 'string', short: 'o' }, size: { type: 'string' }, fps: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    })
  } catch (error) {
    console.error(`${errorMessage(error)}\n\n${USAGE}`)
    return 2
  }
  const { values, positionals } = args
  if (values.help) {
    console.log(USAGE)
    return 0
  }
  const [command, deck = '.', ...rest] = positionals
  if (command !== 'export' || rest.length > 0) {
    console.error(USAGE)
    return 2
  }
  const size = values.size === undefined ? undefined : /^(\d+)x(\d+)$/.exec(values.size)
  const fps = values.fps === undefined ? undefined : Number(values.fps)
  if (size === null || (fps !== undefined && !(fps > 0 && fps <= 60))) {
    console.error(`--size takes <width>x<height> and --fps a number from 1 to 60\n\n${USAGE}`)
    return 2
  }
  if (values.out && !values.out.toLowerCase().endsWith('.webm')) {
    console.error(`presmium-lecture export writes WebM (--out <file>.webm): MP4 would need the GPL FFmpeg of @mediabunny/server`)
    return 2
  }
  if (!existsSync(deck) || !statSync(deck).isDirectory() || !existsSync(join(deck, DECK_ENTRY))) {
    console.error(`no ${DECK_ENTRY} in ${deck}\n\n${USAGE}`)
    return 2
  }
  try {
    const result = await exportVideo({
      deckDir: deck,
      ...values.track ? { track: values.track } : {},
      ...values.out ? { out: values.out } : {},
      ...size ? { width: Number(size[1]), height: Number(size[2]) } : {},
      ...fps ? { fps } : {},
      log: line => console.error(line),
    })
    result.warnings.forEach(w => console.error(`warning: ${w}`))
    console.log(`exported ${shown(result.file)} (lecture ${result.track}, ${clockText(result.duration)}, ${result.frames} frames)`)
    return 0
  } catch (error) {
    console.error(`presmium-lecture: ${errorMessage(error)}`)
    return 2
  }
}
