/**
 * What the renderers publish of the local files a block names (docs/ir.md
 * 6.2), shared by a deck's build (`RenderContext.localAsset`, ./renderers.ts)
 * and the workspace site (@presmium/workspace): the content hash of a file,
 * a directory as its copy with a file listing, the line of a block that
 * holds a URL, and the URLs of raw HTML, found by parsing it as HTML.
 */
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, sep } from 'node:path'
import { deckLocale } from '@presmium/kernel'
import type { SourcePos } from '@presmium/kernel'
import { parseFragment } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'
import { DECK_ENTRY } from './compiler.ts'
import { inside } from './settings.ts'

export { inside }

/** The line of a block's source that holds `text`, else the block's first line. */
export function lineOf(source: SourcePos, text: string): number {
  try {
    const lines = readFileSync(source.file, 'utf8').split(/\r?\n/)
    for (let line = source.line; line <= Math.max(source.line, source.endLine ?? 0); line++) {
      if (lines[line - 1]?.includes(text)) return line
    }
  } catch {
    // The block's line.
  }
  return source.line
}

/** The sha256 of each file read (one per path), while its size, inode and times stay the same. */
const hashes = new Map<string, { stamp: string, hash: string }>()

/**
 * A file changed less than this long before it is hashed may change again
 * within its timestamps' granularity, its size the same: its hash is not
 * kept (as git treats a racily clean entry).
 */
const RACY_MS = 2000

/** The sha256 (hex) of a file's content; read again once its size, inode, modification or change time changed. */
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

/** A name that is not published: hidden (`.git`, `.env`) or `node_modules`. */
function unpublished(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules'
}

/** The files a published directory holds, relative to it: regular files, not hidden, not in `node_modules`, not through symbolic links. */
function directoryFiles(dir: string, prefix = ''): string[] {
  return readdirSync(join(dir, prefix), { withFileTypes: true })
    .filter(entry => !unpublished(entry.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .flatMap((entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      return entry.isDirectory() ? directoryFiles(dir, path) : entry.isFile() ? [path] : []
    })
}

/** What a file listing says, in the deck's language. */
const LISTING = {
  'zh-CN': { count: (n: number) => `${n} 个文件，点击下载`, files: '文件' },
  'en': { count: (n: number) => `${n} file${n === 1 ? '' : 's'}; select one to download it`, files: 'Files' },
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * A directory as it is published: a copy of its files named `<hash>-<name>`
 * (the hash of their paths and contents) with a file listing, `index.html`,
 * from which each file downloads (unless the directory has an `index.html`
 * of its own). The copy is prepared once, in `stage`; the renderers publish
 * it as they publish a file. Each file's content is hashed once while it
 * does not change (`fileHash`), so a large directory costs little to look at again.
 */
function publishedDirectory(dir: string, stage: string, lang?: string): { file: string, name: string } {
  const files = directoryFiles(dir)
  const hash = createHash('sha256')
  for (const file of files) hash.update(file).update('\0').update(fileHash(join(dir, file))).update('\0')
  const name = `${hash.digest('hex').slice(0, 8)}-${basename(dir)}`
  const target = join(stage, name)
  if (existsSync(target)) return { file: target, name }
  // Prepared beside it, then renamed: a build stopped halfway leaves no partial copy under the name.
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
    // Another build prepared it meanwhile.
    rmSync(partial, { recursive: true, force: true })
  }
  return { file: target, name }
}

/**
 * Whether a link to `target` publishes it as a directory (docs/ir.md 6.2):
 * a directory strictly inside the deck (`deckDir`) that is not a deck itself
 * (a link to another document of a workspace stays a link), nor a symbolic link.
 */
export function publishesDirectory(target: string, deckDir: string): boolean {
  return Boolean(lstatSync(target, { throwIfNoEntry: false })?.isDirectory()) && target !== deckDir && inside(target, deckDir) && !existsSync(join(target, DECK_ENTRY))
}

/** Why a directory of the deck is not published (hidden, `node_modules`, or in one); undefined when it is. */
export function unpublishedDirectory(target: string, deckDir: string): string | undefined {
  return relative(deckDir, target).split(sep).some(unpublished) ? 'hidden directories and node_modules are not published' : undefined
}

/**
 * A directory a link publishes (`publishesDirectory`): its copy with a file
 * listing (`publishedDirectory`, prepared in `stage`); one that is hidden or
 * `node_modules`, or lies in one, is not published (`warn` says why).
 */
export function directoryAsset(target: string, deckDir: string, stage: string, lang: string | undefined, warn: (message: string) => void): { file: string, name: string } | undefined {
  const refused = unpublishedDirectory(target, deckDir)
  if (refused) {
    warn(refused)
    return undefined
  }
  return publishedDirectory(target, stage, lang)
}

/**
 * The values of the attributes `names` (lowercase) of the elements of raw
 * HTML, where each is written. The HTML is parsed (parse5, as a browser
 * parses a fragment), so text that only looks like an attribute
 * (`<code> href=x</code>`, a comment, the code of a script) is not one.
 */
export function htmlAttributes(html: string, names: ReadonlySet<string>): { name: string, value: string, start: number, end: number }[] {
  const found: { name: string, value: string, start: number, end: number }[] = []
  const visit = (node: DefaultTreeAdapterMap['node']) => {
    if ('attrs' in node) {
      for (const { name, value } of node.attrs) {
        const at = node.sourceCodeLocation?.attrs?.[name]
        if (names.has(name) && at) found.push({ name, value, start: at.startOffset, end: at.endOffset })
      }
    }
    if ('childNodes' in node) node.childNodes.forEach(visit)
    if ('content' in node) visit(node.content)
  }
  visit(parseFragment(html, { sourceCodeLocationInfo: true }))
  return found.sort((a, b) => a.start - b.start)
}
