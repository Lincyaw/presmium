import { createInterface } from 'node:readline'
import type { Interface } from 'node:readline'
import { existsSync, realpathSync } from 'node:fs'
import { basename, delimiter, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { assertEmpty, createProject, CreateError, isValidPackageName, KINDS, packageNameFor, SITE_THEMES } from './create.ts'
import type { ProjectKind, SiteTheme } from './create.ts'
import { MESSAGES, systemLocale } from './messages.ts'
import type { Locale, Messages } from './messages.ts'

const DEFAULT_DIRS: Record<ProjectKind, string> = {
  document: 'my-document',
  workspace: 'my-course',
  site: 'my-site',
  plugin: 'presmium-plugin-greeting',
}

export async function main(argv: string[]): Promise<number> {
  const t = MESSAGES[systemLocale()]
  let args: ReturnType<typeof parse>
  try {
    args = parse(argv, t)
  } catch (error) {
    process.stderr.write(`create-presmium: ${(error as Error).message}\n\n${t.usage}\n`)
    return 2
  }
  if (args.values.help) {
    process.stdout.write(`${t.usage}\n`)
    return 0
  }
  const questions = new Questions(t)
  try {
    const asking = args.values.type === undefined || args.positionals[0] === undefined
    const kind = args.values.type ?? await questions.kind()
    if (!KINDS.includes(kind as ProjectKind)) throw new CreateError(t.badKind(kind), true)
    const project = kind as ProjectKind
    if (args.values.theme !== undefined && project !== 'site') throw new CreateError(t.themeOnlyForSite, true)
    const theme = args.values.theme ?? 'course'
    if (!SITE_THEMES.includes(theme as SiteTheme)) throw new CreateError(t.badTheme(theme), true)
    const dir = resolve(args.positionals[0] ?? await questions.ask(t.dirQuestion, DEFAULT_DIRS[project]))
    assertEmpty(dir, t)
    const folder = relative(process.cwd(), dir) || '.'
    const title = args.values.title ?? (asking && project !== 'plugin' ? await questions.ask(t.titleQuestion, basename(dir)) : basename(dir))
    const name = args.values.name ?? (asking && project === 'plugin' ? await questions.ask(t.nameQuestion, packageNameFor(dir)) : packageNameFor(dir))
    if (!isValidPackageName(name)) throw new CreateError(t.badName(name))
    questions.close()
    // The project's content is written in the title's language: a Chinese title gets Chinese pages whatever the system says.
    if (args.values.lang !== undefined && !LOCALES.includes(args.values.lang as Locale)) throw new CreateError(t.badLang(args.values.lang), true)
    const lang = (args.values.lang as Locale | undefined) ?? (/\p{Script=Han}/u.test(title) ? 'zh-CN' : systemLocale())
    createProject({ kind: project, dir, title, name, git: args.values.git, theme: theme as SiteTheme, t, content: MESSAGES[lang], lang })
    // A folder outside the current directory is named by its absolute path: a chain of ../ is hard to read.
    const shown = /^\.\.(?:[\\/]|$)/.test(folder) ? dir : folder
    const argument = /[\s'"]/.test(shown) ? JSON.stringify(shown) : shown
    const into = folder === '.' ? [] : [`cd ${argument}`]
    const at = folder === '.' ? '' : ` ${argument}`
    // A document or a workspace opens in Studio, which comes with presmium: with the installation that runs now when
    // the person can name it again, else with the one the new project installs.
    const installation = runningInstallation()
    const steps = project === 'plugin' ? [...into, 'pnpm install', 'pnpm test', 'pnpm dev']
      : project === 'site' ? [...into, 'pnpm install', 'pnpm serve']
        : installation === 'project' ? [`pnpm exec presmium studio${at}`]
          : installation === 'path' ? [`presmium studio${at}`]
            : [...into, 'pnpm install', 'pnpm exec presmium studio']
    process.stdout.write(`${t.created(project, shown)}\n\n${t.next}\n${steps.map(step => `  ${step}\n`).join('')}\n${t.agents}\n`)
    return 0
  } catch (error) {
    if (!(error instanceof CreateError)) throw error
    process.stderr.write(`create-presmium: ${error.message}\n`)
    return error.usage ? 2 : 1
  } finally {
    questions.close()
  }
}

const LOCALES: readonly Locale[] = ['zh-CN', 'en']

/**
 * How the person runs this installation of presmium again: from the node_modules of a project the current directory is
 * in (`pnpm exec presmium`), as `presmium` on PATH (a global installation), or not at all (`pnpm create presmium`).
 */
function runningInstallation(): 'project' | 'path' | 'none' {
  // The command as started (a project's node_modules/.bin) and this file: pnpm's global virtual store keeps the files
  // of a project's packages outside the project.
  for (const path of [process.argv[1], realpathSync(fileURLToPath(import.meta.url))]) {
    const at = path?.indexOf(`${sep}node_modules${sep}`) ?? -1
    if (at <= 0) continue
    const inside = relative(path!.slice(0, at), process.cwd())
    if (!inside.startsWith('..') && !isAbsolute(inside)) return 'project'
  }
  const names = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD').split(';').map(ext => `presmium${ext}`) : ['presmium']
  const found = (process.env.PATH ?? '').split(delimiter).some(dir => dir && names.some(name => existsSync(join(dir, name))))
  return found ? 'path' : 'none'
}

function parse(argv: string[], t: Messages) {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      type: { type: 'string', short: 't' },
      title: { type: 'string' },
      lang: { type: 'string' },
      theme: { type: 'string' },
      name: { type: 'string' },
      git: { type: 'boolean', default: true },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  if (parsed.positionals.length > 1) throw new Error(t.tooManyDirectories(parsed.positionals.length))
  return parsed
}

class Questions {
  #lines?: AsyncIterator<string>
  #reader?: Interface
  readonly t: Messages

  constructor(t: Messages) {
    this.t = t
  }

  async ask(question: string, answer: string): Promise<string> {
    const terminal = process.stdin.isTTY === true
    this.#reader ??= createInterface({ input: process.stdin, terminal, output: terminal ? process.stdout : undefined })
    this.#lines ??= this.#reader[Symbol.asyncIterator]()
    const prompt = `${question} (${answer}): `
    if (terminal) {
      this.#reader.setPrompt(prompt)
      this.#reader.prompt()
    } else {
      process.stdout.write(prompt)
    }
    const next = await this.#lines.next()
    if (next.done) throw new CreateError(this.t.noAnswer, true)
    if (!process.stdin.isTTY) process.stdout.write('\n')
    return next.value.trim() || answer
  }

  async kind(): Promise<string> {
    process.stdout.write(`${this.t.kindQuestion}\n${KINDS.map((kind, i) => `  ${i + 1}. ${this.t.kinds[kind]}\n`).join('')}`)
    const answer = await this.ask(this.t.numberQuestion, '1')
    return KINDS[Number(answer) - 1] ?? answer
  }

  close(): void {
    this.#reader?.close()
    this.#reader = undefined
  }
}

