import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { deckLocale, escapeHtml } from '@presmium/kernel'
import type { SourcePos } from '@presmium/kernel'
import { DECK_ENTRY } from './compiler.ts'
import { inside } from './settings.ts'

export { inside }

export function lineOf(source: SourcePos, text: string): number {
  try {
    const lines = readFileSync(source.file, 'utf8').split(/\r?\n/)
    for (let line = source.line; line <= Math.max(source.line, source.endLine ?? 0); line++) {
      if (lines[line - 1]?.includes(text)) return line
    }
  } catch {
  }
  return source.line
}

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
  return Boolean(lstatSync(target, { throwIfNoEntry: false })?.isDirectory()) && target !== deckDir && inside(target, deckDir) && !existsSync(join(target, DECK_ENTRY))
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
