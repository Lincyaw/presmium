/**
 * A new project from the templates (P-142; src/templates.ts): a lecture, a workspace or a plugin.
 * Its `package.json` lists Presmium's packages at create-presmium's own version, as many as it
 * uses: `@presmium/cli` alone installs no renderer, so the CLI, the three renderers and the
 * official plugins its documents list (scripts/consumer.ts installs the same). Its agents get
 * AGENTS.md (CLAUDE.md links to it) and copies of the skills in `.agents/skills` (`.claude/skills`
 * links there).
 */
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Commands, Messages, ProjectKind } from './messages.ts'
import { projectPath, templateFiles, TEMPLATES } from './templates.ts'

export const KINDS: readonly ProjectKind[] = ['lecture', 'workspace', 'plugin']

/** create-presmium's version: the Presmium a new project installs (the packages are released together). */
export const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version

/** What a document needs to be checked, built in the three forms and previewed (as scripts/consumer.ts's ESSENTIALS). */
const ESSENTIALS = ['@presmium/cli', '@presmium/web', '@presmium/render-slides', '@presmium/render-notebook', '@presmium/slidev-addon-core']

/** The operator plugins templates/workspace/presmium.workspace.yaml lists, installed at the workspace's root. */
const OPERATOR_PLUGINS = ['@presmium/slidev-addon-assistant']

/** The skills each project's agents get. */
const SKILLS: Record<ProjectKind, string[]> = {
  lecture: ['presmium-author', 'presmium-present'],
  workspace: ['presmium-author', 'presmium-present'],
  plugin: ['presmium-develop', 'presmium-author'],
}

/** The directory a new workspace's first document is in. */
export const FIRST_DOCUMENT = 'intro'

/** An npm package name: lowercase, with an optional scope. */
const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/

export interface ProjectOptions {
  kind: ProjectKind
  /** The project's directory, absolute; absent or empty. */
  dir: string
  /** A lecture's or a workspace's title. */
  title: string
  /** The package name. */
  name: string
  git: boolean
  t: Messages
  commands: Commands
}

/** A project that cannot be made as asked; its message is for the user. */
export class CreateError extends Error {
  /** A usage error (exit code 2), not a refusal (1). */
  usage: boolean

  constructor(message: string, usage = false) {
    super(message)
    this.usage = usage
  }
}

export function validName(name: string): boolean {
  return name.length <= 214 && PACKAGE_NAME.test(name)
}

/** A package name from a directory's name: lowercase, other characters as `-`. */
export function nameOf(dir: string): string {
  const name = basename(dir).toLowerCase().replace(/[^a-z0-9._~-]+/g, '-').replace(/^[._~-]+/, '')
  return name || 'presmium-project'
}

/** A plugin's id from its package name: `@acme/greeting` is `acme.greeting`. */
export function pluginId(name: string): string {
  return name.replace(/^@/, '').replace('/', '.')
}

/** Refuses a directory that holds anything. */
export function assertEmpty(dir: string, t: Messages): void {
  if (existsSync(dir) && readdirSync(dir).length > 0) throw new CreateError(t.notEmpty(dir))
}

export function createProject(options: ProjectOptions): void {
  const { kind, dir, title, name, t } = options
  assertEmpty(dir, t)
  if (!validName(name)) throw new CreateError(t.badName(name))
  mkdirSync(dir, { recursive: true })
  const document = (to: string, documentTitle: string) => {
    // As `presmium serve` makes a document (packages/workspace/src/node/files.ts): the title in a YAML
    // string. Replacements are functions, so a `$` in a title stays as it is (`$$x$$`, `US$`).
    const quoted = JSON.stringify(documentTitle).slice(1, -1)
    copyTemplate('document/default', to, (path, text) => path.endsWith('.md') ? text.replaceAll('{{title}}', () => quoted) : text)
  }
  if (kind === 'lecture') {
    document(dir, title)
    copyTemplate('workspace', dir, unchanged, path => path === '.gitignore')
    writePackage(dir, { name, private: true, type: 'module', scripts: { dev: 'presmium dev', check: 'presmium check', build: 'presmium build' }, dependencies: ranges(ESSENTIALS) })
  } else if (kind === 'workspace') {
    copyTemplate('workspace', dir, (path, text) => path === 'presmium.workspace.yaml' ? text.replace(/^title: .*$/m, () => `title: ${JSON.stringify(title)}`) : text)
    document(join(dir, FIRST_DOCUMENT), t.firstDocument)
    writePackage(dir, { name, private: true, type: 'module', scripts: { serve: 'presmium serve', check: `presmium check ${FIRST_DOCUMENT}`, build: 'presmium build' }, dependencies: ranges([...ESSENTIALS, ...OPERATOR_PLUGINS]) })
  } else {
    copyTemplate('plugin', dir, (path, text) => text.replaceAll('{{name}}', () => name).replaceAll('{{id}}', () => pluginId(name)).replaceAll('{{version}}', () => VERSION))
  }
  if (kind !== 'plugin') {
    writeFileSync(join(dir, 'README.md'), t.readme(kind, title, options.commands))
    writeFileSync(join(dir, 'AGENTS.md'), t.agentsFile(kind, title))
  }
  agentFiles(dir, SKILLS[kind])
  if (options.git) gitInit(dir)
}

const unchanged = (_path: string, text: string): string => text

/** The files `copyTemplate` edits as text; others (a document's images, say) are copied as they are. */
const TEXT = /(?:\.(?:md|ts|mts|js|mjs|vue|json|ya?ml|css|html|txt)|(?:^|[\\/])\.gitignore)$/

/** Copies `templates/<template>` (those files `only` takes) into `to`, each text through `edit`. */
function copyTemplate(template: string, to: string, edit: (path: string, text: string) => string, only: (path: string) => boolean = () => true): void {
  const from = join(TEMPLATES, template)
  if (!existsSync(from)) throw new Error(`${from} is missing: create-presmium's templates are copied when it is packed (pnpm --filter create-presmium templates)`)
  for (const stored of templateFiles(from)) {
    const path = projectPath(stored)
    if (!only(path)) continue
    const content = readFileSync(join(from, stored))
    mkdirSync(dirname(join(to, path)), { recursive: true })
    writeFileSync(join(to, path), TEXT.test(path) ? edit(path, content.toString('utf8')) : content)
  }
}

function ranges(names: string[]): Record<string, string> {
  return Object.fromEntries(names.map(name => [name, `^${VERSION}`]))
}

function writePackage(dir: string, pkg: Record<string, unknown>): void {
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
}

/**
 * The skills in `.agents/skills`, `.claude/skills` linking there and CLAUDE.md to AGENTS.md (as in
 * the Presmium repository); where links cannot be made (Windows without the right), a copy of
 * the skills and a CLAUDE.md that imports AGENTS.md.
 */
function agentFiles(dir: string, skills: string[]): void {
  for (const skill of skills) copyTemplate(join('skills', skill), join(dir, '.agents/skills', skill), unchanged)
  mkdirSync(join(dir, '.claude'), { recursive: true })
  try {
    symlinkSync('../.agents/skills', join(dir, '.claude/skills'), 'dir')
  } catch {
    cpSync(join(dir, '.agents/skills'), join(dir, '.claude/skills'), { recursive: true })
  }
  try {
    symlinkSync('AGENTS.md', join(dir, 'CLAUDE.md'))
  } catch {
    writeFileSync(join(dir, 'CLAUDE.md'), '@AGENTS.md\n')
  }
}

/** `git init`, unless the directory is in a git work tree already or git is not installed. */
function gitInit(dir: string): void {
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, encoding: 'utf8' })
  if (inside.error || inside.stdout.trim() === 'true') return
  spawnSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'ignore' })
}
