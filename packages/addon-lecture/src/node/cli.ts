import { existsSync, statSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import { DECK_ENTRY } from '@lincyaw/compiler'
import { errorMessage } from '@lincyaw/kernel'
import { ffmpegInstallCommand, systemLocale } from '@lincyaw/kernel/node'
import { clockText, isWide, LECTURE_MESSAGES, overLimit } from '../domain/index.ts'
import { exportVideo } from './export.ts'
import { timingReport } from './timing.ts'
import type { TimingReport } from './timing.ts'

const USAGE = `Usage: presmium-lecture export [deckDir] [--track <id>] [--out <file.mp4|file.webm>] [--size <width>x<height>] [--fps <n>] [--burn <lang>] [--contact-sheet [<file.png>]]
       presmium-lecture timing [deckDir] [--json]

export builds the deck's web form and lectures, plays the lecture in Chromium
(playwright-chromium) a frame at a time and writes it with its audio and a
subtitle track for each language of its captions, and the captions next to it
(<file>.<lang>.vtt). With FFmpeg (on the path, or PRESMIUM_FFMPEG) the video is
MP4 (H.264, AAC) or WebM (VP9, Opus) as --out names it; without it the browser
writes WebM only, at a lower quality, and the export says how to install it. The
animations follow the lecture's time frame by frame. --track names the
lecture (default: the synthesized one, else the only recorded one); --out the
file (default <deckDir>/dist/<track>.mp4, .webm without FFmpeg); --size the window (default
1920x1080); --fps the frames a second (default 30); --burn draws the captions
in that language on the picture; --contact-sheet also writes one PNG image of
two frames of every step (0.3 s after it starts and at its middle), labelled
with its page and step and taken from the video with FFmpeg (default
<file>.contact-sheet.png).

timing reads the lecture's production plan, the one export plays (the voiceover
already generated, nothing synthesized), and prints per step its page, step,
characters of script, seconds of voiceover, characters a second, animation and
length, then the totals and the video's length against
metadata.renderers.lecture.maximumDurationMs; --json prints the same as JSON.`

function shown(file: string): string {
  const rel = relative(process.cwd(), file)
  return rel.startsWith('..') || isAbsolute(rel) ? file : rel
}

/** `--contact-sheet` takes an optional value: the next argument when it names a PNG file. */
function contactSheetArgument(argv: string[]): { argv: string[], sheet?: string | true } {
  const rest: string[] = []
  let sheet: string | true | undefined
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg.startsWith('--contact-sheet=')) sheet = arg.slice('--contact-sheet='.length)
    else if (arg !== '--contact-sheet') rest.push(arg)
    else if (argv[i + 1] && /\.png$/i.test(argv[i + 1]!) && !argv[i + 1]!.startsWith('-')) sheet = argv[++i]!
    else sheet = true
  }
  return { argv: rest, ...sheet !== undefined ? { sheet } : {} }
}

const seconds = (ms: number | undefined) => (ms ? (ms / 1000).toFixed(1) : '-')

/** The width of text in a terminal: CJK and full-width characters take two columns. */
function columns(text: string): number {
  return [...text].reduce((sum, char) => sum + (isWide(char) ? 2 : 1), 0)
}

function table(rows: string[][], right: ReadonlySet<number>): string {
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map(row => columns(row[i]!))))
  return rows.map(row => row.map((cell, i) => {
    const pad = ' '.repeat(widths[i]! - columns(cell))
    return right.has(i) ? pad + cell : i === row.length - 1 ? cell : cell + pad
  }).join('  ').trimEnd()).join('\n')
}

function printTiming(report: TimingReport): void {
  const { timing, titles, limit } = report
  const t = LECTURE_MESSAGES[systemLocale()].timing, c = t.columns
  if (timing.timing !== 'confirmed') console.log(`${timing.timing === 'unknown' ? t.unknown : t.estimated}\n`)
  const rows = [[c.page, c.step, c.characters, c.voice, c.rate, c.animation, c.length], ...timing.steps.map(step => [
    `${step.page} ${step.pageTitle}`.trim(),
    `${step.step} ${titles.get(step.stepId) ?? ''}`.trim(),
    String(step.characters),
    seconds(step.voiceMs),
    step.voiceMs ? (step.characters * 1000 / step.voiceMs).toFixed(2) : '-',
    seconds(step.animationMs),
    step.lengthMs === undefined ? '-' : (step.lengthMs / 1000).toFixed(1),
  ])]
  console.log(table(rows, new Set([2, 3, 4, 5, 6])))
  console.log(`\n${t.totals(timing.steps.length, timing.characters, (timing.voiceMs / 1000).toFixed(1), timing.rate?.toFixed(2))}`)
  if (timing.durationMs === undefined) return
  const over = typeof limit === 'number' ? overLimit(timing, limit) : undefined
  const verdict = typeof limit !== 'number' ? undefined : over ? t.over(clockText(limit), (over.overMs / 1000).toFixed(1), over.cut) : t.within(clockText(limit))
  console.log(t.video(clockText(timing.durationMs), (timing.durationMs / 1000).toFixed(1), verdict))
  if (limit === 'invalid') console.log(t.limitInvalid)
}

function timingJson(report: TimingReport): unknown {
  const { timing, titles, limit } = report
  const over = typeof limit === 'number' ? overLimit(timing, limit) : undefined
  return {
    ...timing,
    steps: timing.steps.map(step => ({ ...step, ...titles.has(step.stepId) ? { title: titles.get(step.stepId) } : {} })),
    ...limit !== undefined ? { maximumDurationMs: limit } : {},
    ...over ? { overMs: over.overMs, ...over.cut !== undefined ? { cutCharacters: over.cut } : {} } : {},
  }
}

export async function main(argv: string[]): Promise<number> {
  const { argv: rest, sheet } = contactSheetArgument(argv)
  let args
  try {
    args = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { track: { type: 'string' }, out: { type: 'string', short: 'o' }, size: { type: 'string' }, fps: { type: 'string' }, burn: { type: 'string' }, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
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
  const [command, deck = '.', ...extra] = positionals
  const exportOnly = Boolean(values.track || values.out || values.size || values.fps || values.burn || sheet)
  if ((command !== 'export' && command !== 'timing') || extra.length > 0 || (command === 'timing' && exportOnly) || (command === 'export' && values.json)) {
    console.error(USAGE)
    return 2
  }
  if (!existsSync(deck) || !statSync(deck).isDirectory() || !existsSync(join(deck, DECK_ENTRY))) {
    console.error(`no ${DECK_ENTRY} in ${deck}\n\n${USAGE}`)
    return 2
  }
  if (command === 'timing') {
    try {
      const report = await timingReport(deck)
      if (values.json) console.log(JSON.stringify(timingJson(report), null, 2))
      else printTiming(report)
      return 0
    } catch (error) {
      console.error(`presmium-lecture: ${errorMessage(error)}`)
      return 2
    }
  }
  const size = values.size === undefined ? undefined : /^(\d+)x(\d+)$/.exec(values.size)
  const fps = values.fps === undefined ? undefined : Number(values.fps)
  if (size === null || (fps !== undefined && !(fps > 0 && fps <= 60))) {
    console.error(`--size takes <width>x<height> and --fps a number from 1 to 60\n\n${USAGE}`)
    return 2
  }
  if (values.out && !/\.(mp4|webm)$/i.test(values.out)) {
    console.error(`presmium-lecture export writes MP4 or WebM (--out <file>.mp4 or <file>.webm)`)
    return 2
  }
  if (typeof sheet === 'string' && !/\.png$/i.test(sheet)) {
    console.error(`presmium-lecture export writes the contact sheet as PNG (--contact-sheet <file>.png)`)
    return 2
  }
  try {
    const result = await exportVideo({
      deckDir: deck,
      ...values.track ? { track: values.track } : {},
      ...values.out ? { out: values.out } : {},
      ...size ? { width: Number(size[1]), height: Number(size[2]) } : {},
      ...fps ? { fps } : {},
      ...values.burn ? { burn: values.burn } : {},
      ...sheet ? { contactSheet: sheet } : {},
      log: line => console.error(line),
    })
    result.warnings.forEach(w => console.error(`warning: ${w}`))
    console.log(`exported ${shown(result.file)} (lecture ${result.track}, ${clockText(result.duration)}, ${result.frames} frames)`)
    for (const { file } of result.captions) console.log(`captions ${shown(file)}`)
    const t = LECTURE_MESSAGES[systemLocale()].sheet, made = result.contactSheet
    if (made && 'unavailable' in made) console.error(`presmium-lecture: ${t.needsFfmpeg(shown(made.file), ffmpegInstallCommand())}`)
    else if (made) {
      if (!made.labelled) console.error(`presmium-lecture: ${t.unlabelled(shown(made.file))}`)
      console.log(t.written(shown(made.file), made.frames))
    }
    return 0
  } catch (error) {
    console.error(`presmium-lecture: ${errorMessage(error)}`)
    return 2
  }
}
