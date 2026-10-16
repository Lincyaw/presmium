import { isAbsolute, join, relative } from 'node:path'
import { parseArgs } from 'node:util'
import type { ParseArgsConfig } from 'node:util'
import { DECK_ENTRY } from '@presmium/compiler'
import { errorMessage } from '@presmium/kernel'
import { visualDiff } from './diff.ts'
import { exportDeck } from './export.ts'
import { isDeck } from './slides.ts'

// Exit codes as in `presmium check`: 0 ok, 1 problems found, 2 usage or runtime error.

const EXPORT_USAGE = `Usage: presmium-export [deckDir] [--format pdf|png] [--output <file.pdf | dir>] [--with-clicks] [--range <1,3-5>] [--dark] [--timeout <ms>] [--json]

Renders the deck with the slides renderer and exports the Slidev deck it
writes with \`slidev export\`: to PDF (default), then checks that every link
the slides show (Markdown links, href and *link/*url attributes, code
permalinks) is still a link in the PDF, and exits 1 when a link was lost; or
to PNG images, one per slide (per click step with --with-clicks), in the
--output directory, where links cannot be checked.`

const DIFF_USAGE = `Usage: presmium-diff <refA> <refB> [deckDir] [--out <dir>] [--threshold <ratio>] [--wait <ms>] [--install] [--json]

Renders the deck of two commits in each of its forms: the slides (every slide
and click step, exported as PNG) and the web form (every page in the document
view and every section in the present view, captured with playwright-chromium).
Compares the images pixel by pixel and writes report.md and report.json
(default directory <deckDir>/.presmium/diff). Exits 1 when a page differs by
more than the threshold (a ratio of pixels, default 0). --wait lets each page
settle before it is captured (default 500). Both commits render with the host and addons
installed for the deck; --install renders each commit with the dependencies of
its own pnpm lockfile instead, e.g. to check a host or addon upgrade.`

/** A path relative to the working directory when it lies inside it. */
function shown(file: string): string {
  const rel = relative(process.cwd(), file)
  return rel === '' ? '.' : rel.startsWith('..') || isAbsolute(rel) ? file : rel
}

function parse<T extends ParseArgsConfig['options']>(argv: string[], options: T, usage: string) {
  try {
    return parseArgs({ args: argv, options: { ...options, json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } }, allowPositionals: true })
  } catch (error) {
    console.error(`${errorMessage(error)}\n\n${usage}`)
    return undefined
  }
}

function deckOrError(dir: string, usage: string): string | undefined {
  if (isDeck(dir)) return dir
  console.error(`no ${DECK_ENTRY} in ${dir}\n\n${usage}`)
  return undefined
}

export async function exportMain(argv: string[]): Promise<number> {
  const args = parse(argv, {
    'format': { type: 'string' },
    'output': { type: 'string', short: 'o' },
    'with-clicks': { type: 'boolean', short: 'c' },
    'range': { type: 'string' },
    'dark': { type: 'boolean' },
    'timeout': { type: 'string' },
  }, EXPORT_USAGE)
  if (!args) return 2
  const { values, positionals } = args
  if (values.help) {
    console.log(EXPORT_USAGE)
    return 0
  }
  const format = values.format ?? 'pdf'
  if (positionals.length > 1 || (format !== 'pdf' && format !== 'png')) {
    console.error(EXPORT_USAGE)
    return 2
  }
  const deckDir = deckOrError(positionals[0] ?? '.', EXPORT_USAGE)
  if (!deckDir) return 2
  try {
    const result = await exportDeck({
      deckDir,
      format,
      output: values.output as string | undefined,
      withClicks: values['with-clicks'] as boolean | undefined,
      range: values.range as string | undefined,
      dark: values.dark as boolean | undefined,
      timeout: values.timeout === undefined ? undefined : Number(values.timeout),
    })
    const lost = result.links.filter(link => link.pages.length === 0)
    if (values.json) {
      console.log(JSON.stringify({ ...result, lost: lost.length }, null, 2))
    } else {
      result.warnings.forEach(w => console.error(`warning: ${w}`))
      if (format === 'png') {
        console.log(`exported ${shown(result.output)} (${result.pages} images); links are not checked in images`)
      } else {
        console.log(`exported ${shown(result.output)} (${result.pages} pages)`)
        for (const link of lost) console.log(`${shown(link.source.file)}:${link.source.line}  link lost  ${link.url} (slide ${link.slide})`)
        console.log(`${result.links.length - lost.length} of ${result.links.length} links kept`)
      }
    }
    return lost.length > 0 ? 1 : 0
  } catch (error) {
    console.error(`presmium-export: ${errorMessage(error)}`)
    return 2
  }
}

export async function diffMain(argv: string[]): Promise<number> {
  const args = parse(argv, {
    out: { type: 'string', short: 'o' },
    threshold: { type: 'string' },
    wait: { type: 'string' },
    install: { type: 'boolean' },
  }, DIFF_USAGE)
  if (!args) return 2
  const { values, positionals } = args
  if (values.help) {
    console.log(DIFF_USAGE)
    return 0
  }
  const threshold = values.threshold === undefined ? 0 : Number(values.threshold)
  const wait = values.wait === undefined ? undefined : Number(values.wait)
  if (!(threshold >= 0 && threshold <= 1) || (wait !== undefined && !(wait >= 0))) {
    console.error(`--threshold must be a ratio between 0 and 1, --wait a number of milliseconds\n\n${DIFF_USAGE}`)
    return 2
  }
  const [refA, refB, dir = '.', ...extra] = positionals
  if (!refA || !refB || extra.length > 0) {
    console.error(DIFF_USAGE)
    return 2
  }
  const deckDir = deckOrError(dir, DIFF_USAGE)
  if (!deckDir) return 2
  try {
    const { report, out, warnings } = await visualDiff({ refA, refB, deckDir, out: values.out as string | undefined, threshold, wait, install: values.install as boolean | undefined })
    warnings.forEach(w => console.error(`warning: ${w}`))
    if (values.json) {
      console.log(JSON.stringify(report, null, 2))
    } else {
      for (const page of report.listed) console.log(`${page.id}  ${page.status}  ${(page.ratio * 100).toFixed(2)}%`)
      console.log(`${report.listed.length} of ${report.pages.length} pages differ; report: ${shown(join(out, 'report.md'))}`)
    }
    return report.listed.length > 0 ? 1 : 0
  } catch (error) {
    console.error(`presmium-diff: ${errorMessage(error)}`)
    return 2
  }
}
