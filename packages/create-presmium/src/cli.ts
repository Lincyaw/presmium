import { createInterface } from 'node:readline'
import type { Interface } from 'node:readline'
import { basename, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { assertEmpty, createProject, CreateError, isValidPackageName, KINDS, packageNameFor } from './create.ts'
import type { ProjectKind } from './create.ts'
import { MESSAGES, systemLocale } from './messages.ts'
import type { Messages } from './messages.ts'

const DEFAULT_DIRS: Record<ProjectKind, string> = {
  lecture: 'my-lecture',
  workspace: 'my-course',
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
    const dir = resolve(args.positionals[0] ?? await questions.ask(t.dirQuestion, DEFAULT_DIRS[project]))
    assertEmpty(dir, t)
    const folder = relative(process.cwd(), dir) || '.'
    const title = args.values.title ?? (asking && project !== 'plugin' ? await questions.ask(t.titleQuestion, basename(dir)) : basename(dir))
    const name = args.values.name ?? (asking && project === 'plugin' ? await questions.ask(t.nameQuestion, packageNameFor(dir)) : packageNameFor(dir))
    if (!isValidPackageName(name)) throw new CreateError(t.badName(name))
    questions.close()
    createProject({ kind: project, dir, title, name, git: args.values.git, t })
    const steps = [...folder === '.' ? [] : [`cd ${/[\s'"]/.test(folder) ? JSON.stringify(folder) : folder}`], ...project === 'plugin' ? ['pnpm install', 'pnpm test', 'pnpm dev'] : [`presmium ${project === 'lecture' ? 'dev' : 'serve'}`]]
    process.stdout.write(`${t.created(project, folder)}\n\n${t.next}\n${steps.map(step => `  ${step}\n`).join('')}\n${t.agents}\n`)
    return 0
  } catch (error) {
    if (!(error instanceof CreateError)) throw error
    process.stderr.write(`create-presmium: ${error.message}\n`)
    return error.usage ? 2 : 1
  } finally {
    questions.close()
  }
}

function parse(argv: string[], t: Messages) {
  const parsed = parseArgs({
    args: argv,
    allowPositionals: true,
    allowNegative: true,
    options: {
      type: { type: 'string', short: 't' },
      title: { type: 'string' },
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

