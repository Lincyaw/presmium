#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, relative } from 'node:path'

const emitWarning = process.emitWarning
process.emitWarning = (warning, ...args) => {
  const code = typeof args[0] === 'object' ? args[0]?.code : args[1]
  if (code !== 'DEP0040') emitWarning.call(process, warning, ...args)
}

const root = new URL('..', import.meta.url).pathname
const skillsDir = join(root, '.agents/skills')
const problems = []
const fail = message => problems.push(message)

const compilerRequire = createRequire(join(root, 'packages/compiler/package.json'))
const { createJiti } = compilerRequire('jiti')
const YAML = compilerRequire('yaml')
const jiti = createJiti(join(root, 'packages/compiler/src/plugins.ts'))

function checkLink(path, target) {
  const file = join(root, path)
  if (!existsSync(file) && !isLink(file)) return fail(`${path} is missing; it must be a symbolic link to ${target}`)
  if (!isLink(file)) return fail(`${path} must be a symbolic link to ${target}, not a copy`)
  if (readlinkSync(file) !== target) fail(`${path} links to ${readlinkSync(file)}, expected ${target}`)
}

function isLink(file) {
  try {
    return lstatSync(file).isSymbolicLink()
  } catch {
    return false
  }
}

checkLink('.claude/skills', '../.agents/skills')
checkLink('AGENTS.md', 'CLAUDE.md')

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const skills = existsSync(skillsDir) ? readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort() : []
if (skills.length === 0) fail('.agents/skills holds no skill')

const skillFiles = name => readdirSync(join(skillsDir, name), { recursive: true, encoding: 'utf8' })
  .filter(f => f.endsWith('.md'))
  .map(f => join(skillsDir, name, f))

const texts = new Map()
for (const name of skills) {
  const file = join(skillsDir, name, 'SKILL.md')
  const where = relative(root, file)
  if (!existsSync(file)) {
    fail(`${relative(root, join(skillsDir, name))} has no SKILL.md`)
    continue
  }
  const text = readFileSync(file, 'utf8')
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text)
  let meta
  try {
    meta = match ? YAML.parse(match[1]) : undefined
  } catch (error) {
    fail(`${where}: invalid frontmatter: ${error.message}`)
    continue
  }
  if (!meta || typeof meta !== 'object') {
    fail(`${where}: missing frontmatter (--- name, description ---)`)
    continue
  }
  if (meta.name !== name) fail(`${where}: name is "${meta.name}", expected the directory name "${name}"`)
  if (!NAME.test(name) || name.length > 64) fail(`${where}: the name must be kebab-case, at most 64 characters`)
  if (typeof meta.description !== 'string' || !meta.description.trim()) fail(`${where}: description is empty`)
  else if (meta.description.length > 1024) fail(`${where}: description has ${meta.description.length} characters, at most 1024`)
  for (const md of skillFiles(name)) {
    const content = readFileSync(md, 'utf8')
    texts.set(md, content)
    for (const [, owner, ref] of content.matchAll(/(?<![\w-])(?:([a-z0-9]+(?:-[a-z0-9]+)*)\/)?(references\/[\w./-]+\.md)\b/g)) {
      const dir = owner && skills.includes(owner) ? owner : name
      if (!existsSync(join(skillsDir, dir, ref))) fail(`${relative(root, md)}: refers to ${dir === name ? ref : `${dir}/${ref}`}, which does not exist`)
    }
  }
}

function exportTarget(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined
  return exportTarget(value.import) ?? exportTarget(value.node) ?? exportTarget(value.default)
}

const declared = new Map()
const { BUILTIN_DIRECTIVES } = await jiti.import(join(root, 'packages/compiler/src/blocks.ts'))
for (const name of BUILTIN_DIRECTIVES.keys()) declared.set(name, 'the compiler')
for (const dir of readdirSync(join(root, 'packages')).sort()) {
  const pkgFile = join(root, 'packages', dir, 'package.json')
  if (!existsSync(pkgFile)) continue
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  const target = exportTarget(pkg.exports?.['./presmium'])
  if (!target) continue
  let plugin
  try {
    plugin = await jiti.import(join(root, 'packages', dir, target), { default: true })
  } catch (error) {
    fail(`cannot load the ./presmium entry of ${pkg.name}: ${error.message}`)
    continue
  }
  for (const spec of plugin?.directives ?? []) declared.set(spec.name, pkg.name)
}
if (declared.size === 0) fail('found no directives; did the plugin loading change?')

const reference = join(skillsDir, 'presmium-author/references/directives.md')
if (!existsSync(reference)) {
  fail(`${relative(root, reference)} is missing`)
} else {
  const headings = readFileSync(reference, 'utf8').split('\n').filter(line => line.startsWith('### '))
  for (const [name, source] of declared) {
    if (!headings.some(line => line.includes(`\`{${name}}\``))) fail(`${relative(root, reference)} has no section for {${name}} (declared by ${source}): a heading such as ### \`{${name}}\``)
  }
}

function cliCommands() {
  const usage = execFileSync(process.execPath, [join(root, 'packages/cli/bin/presmium.mjs'), '--help'], { encoding: 'utf8' })
  const commands = new Map()
  let current
  for (const line of usage.split('\n')) {
    const command = /^ {2}([a-z][\w-]*) {2,}/.exec(line)
    if (command) {
      current = new Set(['help'])
      commands.set(command[1], current)
      continue
    }
    const option = /^ {4,}--([\w-]+)/.exec(line)
    if (option && current) current.add(option[1])
    if (!line.trim()) current = undefined
  }
  return commands
}

const commands = cliCommands()
if (commands.size === 0) fail('could not read the commands from `presmium --help`')
const MENTION = /(?<![\w@/.-])presmium[ \t]+([a-z][\w-]*)([^`|;&，。）)\n]*)/g
for (const [file, text] of texts) {
  for (const [, command, rest] of text.matchAll(MENTION)) {
    const where = relative(root, file)
    const options = commands.get(command)
    if (!options) {
      fail(`${where}: "presmium ${command}" is not a CLI command (commands: ${[...commands.keys()].join(', ')})`)
      continue
    }
    for (const [, option] of rest.matchAll(/(?:^|\s)--([\w-]+)/g)) {
      if (!options.has(option)) fail(`${where}: "presmium ${command}" has no option --${option}`)
    }
  }
}

const bundle = join(root, 'packages/dsh/package.json')
if (existsSync(bundle)) {
  const bundled = JSON.parse(readFileSync(bundle, 'utf8')).presmium?.skills ?? []
  if (bundled.length === 0) fail('packages/dsh/package.json names no skill (presmium.skills)')
  for (const name of bundled) {
    if (!skills.includes(name)) fail(`packages/dsh/package.json: the bundle registers the skill ${name}, which is not in .agents/skills`)
  }
}

if (problems.length) {
  console.error(`skill problems:\n${problems.join('\n')}`)
  process.exit(1)
}
console.log(`skills ok: ${skills.length} skills, ${declared.size} directives documented, commands ${[...commands.keys()].join(', ')}`)
