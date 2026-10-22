import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { deckLocale, escapeHtml, NON_FILE_URL } from '@lincyaw/kernel'
import type { DocumentLink, Finding, LocalAsset, SourcePos } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import type { Compilation } from './compiler.ts'
import { DECK_ENTRY, WORK_DIR } from './paths.ts'
import { lineContaining } from './source-lines.ts'

const hashes = new Map<string, { stamp: string, hash: string }>()

const RACY_MS = 2000

export function fileHash(file: string): string {
  const stat = statSync(file, { bigint: true })
  const stamp = `${stat.size}:${stat.ino}:${stat.mtimeNs}:${stat.ctimeNs}`
  const known = hashes.get(file)
  if (known?.stamp === stamp) return known.hash
  const hash = createHash('sha256').update(readFileSync(file)).digest('hex')
  if (Date.now() - Number(stat.ctimeMs) > RACY_MS && Date.now() - Number(stat.mtimeMs) > RACY_MS) hashes.set(file, { stamp, hash })
  else hashes.delete(file)
  return hash
}

function unpublished(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules'
}

function directoryFiles(dir: string, prefix = ''): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true })
    .filter(entry => !unpublished(entry.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) return existsSync(join(dir, path, DECK_ENTRY)) ? [] : directoryFiles(dir, path)
      return entry.isFile() ? [path] : []
    })
}

const LISTING = {
  'zh-CN': { count: (n: number) => `${n} 个文件，点击下载`, files: '文件' },
  'en': { count: (n: number) => `${n} file${n === 1 ? '' : 's'}; select one to download it`, files: 'Files' },
}

function publishedDirectory(dir: string, stage: string, lang?: string): { file: string, name: string } {
  const files = directoryFiles(dir)
  const hash = createHash('sha256')
  for (const file of files) hash.update(file).update('\0').update(fileHash(join(dir, file))).update('\0')
  const name = `${hash.digest('hex').slice(0, 8)}-${basename(dir)}`
  const target = join(stage, name)
  if (existsSync(target)) return { file: target, name }
  const partial = `${target}.${process.pid}`
  rmSync(partial, { recursive: true, force: true })
  mkdirSync(partial, { recursive: true })
  for (const file of files) cpSync(join(dir, file), join(partial, file))
  if (!files.includes('index.html')) {
    const t = LISTING[deckLocale(lang)]
    const href = (file: string) => file.split('/').map(encodeURIComponent).join('/')
    const items = files.map(file => `<li><a href="${escapeHtml(href(file))}" download>${escapeHtml(file)}</a> <small>${statSync(join(dir, file)).size} B</small></li>`)
    writeFileSync(join(partial, 'index.html'), `<!doctype html>
<html lang="${escapeHtml(lang ?? 'zh-CN')}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(basename(dir))}</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:48rem;margin:2rem auto;padding:0 1rem}small{color:#666}</style></head>
<body><h1>${escapeHtml(basename(dir))}/</h1><p>${escapeHtml(t.count(files.length))}</p>
<ul aria-label="${escapeHtml(t.files)}">
${items.join('\n')}
</ul></body></html>
`)
  }
  try {
    renameSync(partial, target)
  } catch {
    rmSync(partial, { recursive: true, force: true })
  }
  return { file: target, name }
}

export function publishesDirectory(target: string, deckDir: string): boolean {
  return Boolean(lstatSync(target, { throwIfNoEntry: false })?.isDirectory()) && target !== deckDir && isInside(target, deckDir) && !existsSync(join(target, DECK_ENTRY))
}

export function unpublishedDirectory(target: string, deckDir: string): string | undefined {
  return relative(deckDir, target).split(sep).some(unpublished) ? 'hidden directories and node_modules are not published' : undefined
}

export function directoryAsset(target: string, deckDir: string, stage: string, lang: string | undefined, warn: (message: string) => void): { file: string, name: string } | undefined {
  const refused = unpublishedDirectory(target, deckDir)
  if (refused) {
    warn(refused)
    return undefined
  }
  return publishedDirectory(target, stage, lang)
}

const FILES_DIR = 'files'

export function localAsset(deckDir: string, source: SourcePos, url: string): { file: string, name: string } | undefined {
  if (NON_FILE_URL.test(url)) return undefined
  const path = url.replace(/[?#].*$/s, '')
  if (!path) return undefined
  let name = path
  try {
    name = decodeURIComponent(path)
  } catch {
  }
  const file = name.startsWith('/') ? join(deckDir, 'public', name) : resolve(dirname(source.file), name)
  if (!existsSync(file) || !statSync(file).isFile()) return undefined
  return { file, name: `${fileHash(file).slice(0, 8)}-${basename(file)}` }
}

function localTarget(source: SourcePos, url: string): string | undefined {
  if (NON_FILE_URL.test(url)) return undefined
  const path = url.replace(/[?#].*$/s, '')
  if (!path || path.startsWith('/')) return undefined
  let name = path
  try {
    name = decodeURIComponent(path)
  } catch {
  }
  return resolve(dirname(source.file), name)
}

export function documentLink(compilation: Compilation, source: SourcePos, url: string): DocumentLink | undefined {
  const target = localTarget(source, url)
  if (!target) return undefined
  const dir = basename(target) === DECK_ENTRY && statSync(target, { throwIfNoEntry: false })?.isFile() ? dirname(target)
    : statSync(target, { throwIfNoEntry: false })?.isDirectory() && existsSync(join(target, DECK_ENTRY)) ? target
      : undefined
  if (dir === undefined || !isInside(dir, compilation.workspaceRoot)) return undefined
  const hash = url.indexOf('#')
  let fragment = hash < 0 ? '' : url.slice(hash + 1)
  try {
    fragment = decodeURIComponent(fragment)
  } catch {
  }
  return { dir: relative(compilation.workspaceRoot, dir).split(sep).join('/'), ...fragment ? { fragment } : {} }
}

export function publishedAsset(compilation: Compilation, source: SourcePos, url: string, report: (finding: Finding) => void): LocalAsset | undefined {
  const { deckDir, workspaceRoot } = compilation
  const warn = (message: string) => report({ checkId: 'presmium.links', severity: 'warning', message, source: { file: source.file, line: lineContaining(source, url) } })
  const target = localTarget(source, url)
  const found = localAsset(deckDir, source, url)
  if (found && target && basename(realpathSync(found.file)) === DECK_ENTRY) {
    const linked = documentLink(compilation, source, url)
    warn(`${url} is not published: it is the source of ${linked?.dir ? `the document ${linked.dir}` : 'a document'}, which a workspace site links as its page; this build keeps the link as written`)
    return undefined
  }
  if (found && !isInside(found.file, workspaceRoot) && existsSync(join(workspaceRoot, '.git'))) {
    warn(`${url} is not published: the file lies outside the deck's repository`)
    return undefined
  }
  if (found) return { ...found, directory: false }
  if (!target) return undefined
  if (!existsSync(target)) {
    warn(`${url} is not published: there is no such file`)
    return undefined
  }
  if (!publishesDirectory(target, deckDir)) return undefined
  const directory = directoryAsset(target, deckDir, join(deckDir, WORK_DIR, FILES_DIR), compilation.doc.meta.lang, message => warn(`${url} is not published: ${message}`))
  return directory && { ...directory, directory: true }
}
