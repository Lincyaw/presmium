import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import type { Messages } from './messages.ts'
import { projectPath, templateDir, templateFiles } from './templates.ts'

export type ProjectKind = 'lecture' | 'workspace' | 'plugin'

export const KINDS: readonly ProjectKind[] = ['lecture', 'workspace', 'plugin']

export const VERSION = (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version

const SKILLS: Record<ProjectKind, string[]> = {
  lecture: ['presmium-author', 'presmium-present'],
  workspace: ['presmium-author', 'presmium-present'],
  plugin: ['presmium-develop', 'presmium-author'],
}

export const FIRST_DOCUMENT = 'intro'

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/

export interface ProjectOptions {
  kind: ProjectKind
  dir: string
  title: string
  name: string
  git: boolean
  t: Messages
}

export class CreateError extends Error {
  usage: boolean

  constructor(message: string, usage = false) {
    super(message)
    this.usage = usage
  }
}

export function isValidPackageName(name: string): boolean {
  return name.length <= 214 && PACKAGE_NAME.test(name)
}

export function packageNameFor(dir: string): string {
  const name = basename(dir).toLowerCase().replace(/[^a-z0-9._~-]+/g, '-').replace(/^[._~-]+/, '')
  return name || 'presmium-project'
}

export function pluginIdFor(packageName: string): string {
  return packageName.replace(/^@/, '').replace('/', '.')
}

export function assertEmpty(dir: string, t: Messages): void {
  if (existsSync(dir) && readdirSync(dir).length > 0) throw new CreateError(t.notEmpty(dir))
}

export function createProject(options: ProjectOptions): void {
  const { kind, dir, title, name, t } = options
  assertEmpty(dir, t)
  if (!isValidPackageName(name)) throw new CreateError(t.badName(name))
  mkdirSync(dir, { recursive: true })
  const document = (to: string, documentTitle: string) => {
    const quoted = JSON.stringify(documentTitle).slice(1, -1)
    copyTemplate('document/default', to, (path, text) => path.endsWith('.md') ? text.replaceAll('{{title}}', () => quoted) : text)
  }
  if (kind === 'lecture') {
    document(dir, title)
    copyTemplate('workspace', dir, unchanged, path => path === '.gitignore' || path === 'pnpm-workspace.yaml')
    writePackage(dir, { name, private: true, type: 'module', scripts: { dev: 'presmium dev', check: 'presmium check', build: 'presmium build' }, devDependencies: { '@lincyaw/presmium': `^${VERSION}` } })
  } else if (kind === 'workspace') {
    copyTemplate('workspace', dir, (path, text) => path === 'presmium.workspace.yaml' ? text.replace(/^title: .*$/m, () => `title: ${JSON.stringify(title)}`) : text)
    document(join(dir, FIRST_DOCUMENT), t.firstDocument)
    writePackage(dir, { name, private: true, type: 'module', scripts: { serve: 'presmium serve', check: `presmium check ${FIRST_DOCUMENT}`, build: 'presmium build' }, devDependencies: { '@lincyaw/presmium': `^${VERSION}` } })
  } else {
    copyTemplate('plugin', dir, (path, text) => text.replaceAll('{{name}}', () => name).replaceAll('{{id}}', () => pluginIdFor(name)).replaceAll('{{version}}', () => VERSION))
  }
  if (kind !== 'plugin') {
    writeFileSync(join(dir, 'README.md'), t.readme(kind, title))
    writeFileSync(join(dir, 'AGENTS.md'), t.agentsFile(kind, title))
  }
  agentFiles(dir, SKILLS[kind])
  if (options.git) gitInit(dir)
}

const unchanged = (_path: string, text: string): string => text

const TEXT = /(?:\.(?:md|ts|mts|js|mjs|vue|json|ya?ml|css|html|txt)|(?:^|[\\/])\.gitignore)$/

function copyTemplate(template: string, to: string, edit: (path: string, text: string) => string, only: (path: string) => boolean = () => true): void {
  const from = templateDir(template)
  if (!existsSync(from)) throw new Error(`${from} is missing`)
  for (const stored of templateFiles(from)) {
    const path = projectPath(stored)
    if (!only(path)) continue
    const content = readFileSync(join(from, stored))
    mkdirSync(dirname(join(to, path)), { recursive: true })
    writeFileSync(join(to, path), TEXT.test(path) ? edit(path, content.toString('utf8')) : content)
  }
}

function writePackage(dir: string, pkg: Record<string, unknown>): void {
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`)
}

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

function gitInit(dir: string): void {
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: dir, encoding: 'utf8' })
  if (inside.error || inside.stdout.trim() === 'true') return
  spawnSync('git', ['init', '--quiet'], { cwd: dir, stdio: 'ignore' })
}
