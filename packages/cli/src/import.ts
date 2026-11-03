// `presmium import`: a folder of Markdown notes (or one note) to documents, one `lecture.json` per note.
//
// `a/b/note.md` becomes `<out>/a/b/note/lecture.json`. Wikilinks resolve as note-taking apps resolve them: by path,
// then by file name or alias (case-insensitive), the nearest note winning when several share a name; a folder's
// `index` or `README` note also answers to the folder's name. A local file a note links to is copied into its
// document's `attachments/`, since a document publishes only files inside the workspace; an excluded folder (`raw`,
// say) is neither imported nor copied from.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, posix, relative, resolve, sep } from 'node:path'
import { DOCUMENT_ENTRY } from '@lincyaw/kernel'
import { headingSlug, markdownDocument, noteTitle, splitFrontmatter } from './markdown.ts'

export interface ImportOptions {
  out: string
  /** Names (with `*`) of folders and files to leave out, matched against each part of a path. */
  exclude?: string[]
  lang?: string
  /** The note's folder at this depth becomes the document's first tag, by which the site's sidebar groups documents. */
  group?: number
}

export interface ImportReport {
  /** The written documents' folders, relative to `out`. */
  documents: string[]
  files: number
  unresolved: { note: string, link: string }[]
}

interface Note { file: string, path: string, dir: string, title: string, aliases: string[] }

const MARKDOWN = new Set(['.md', '.markdown'])
const SKIPPED = new Set(['node_modules'])
const RESERVED = new Set(['dist', 'templates', 'node_modules'])
const FOLDER_NOTES = new Set(['index', 'readme'])
const ATTACHMENTS = 'attachments'

const glob = (pattern: string) => new RegExp(`^${pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i')
const toPosix = (path: string) => path.split(sep).join('/')
const key = (target: string) => target.trim().replace(/^\/+/, '').replace(/\.(?:md|markdown)$/i, '').toLowerCase()
/** A document folder's part: letters, digits, `.`, `_` and `-`, not starting with `.`. */
const part = (name: string) => name.replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^[.-]+/, '') || 'note'

export function importMarkdown(input: string, options: ImportOptions): ImportReport {
  const source = resolve(input)
  const out = resolve(options.out)
  const excluded = (options.exclude ?? []).map(glob)
  const isExcluded = (path: string) => path.split('/').some(name => excluded.some(pattern => pattern.test(name)))
  const single = statSync(source).isFile()
  const root = single ? dirname(source) : source

  const files: string[] = []
  const seen = new Set<string>()
  const walk = (dir: string) => {
    const real = realpathSync(dir)
    if (seen.has(real)) return
    seen.add(real)
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name)
      if (name.startsWith('.') || SKIPPED.has(name) || isExcluded(toPosix(relative(root, file)))) continue
      const stat = statSync(file, { throwIfNoEntry: false })
      if (stat?.isDirectory()) walk(file)
      else if (stat?.isFile() && MARKDOWN.has(extname(name).toLowerCase())) files.push(file)
    }
  }
  if (single) files.push(source)
  else walk(source)

  const taken = new Set<string>()
  const notes: Note[] = files.map((file) => {
    const path = toPosix(relative(root, file))
    const parts = path.replace(/\.(?:md|markdown)$/i, '').split('/').map(part)
    if (RESERVED.has(parts[0]!)) parts[0] = `${parts[0]}-notes`
    let dir = parts.join('/')
    for (let n = 2; taken.has(dir.toLowerCase()); n++) dir = `${parts.join('/')}-${n}`
    taken.add(dir.toLowerCase())
    const text = readFileSync(file, 'utf8')
    return { file, path, dir, title: noteTitle(text) ?? basename(file, extname(file)), aliases: splitFrontmatter(text).frontmatter.aliases }
  })

  const byPath = new Map(notes.map(note => [key(note.path), note]))
  const byName = new Map<string, Note[]>()
  const register = (name: string, note: Note) => {
    const k = key(name)
    if (k && !byName.get(k)?.includes(note)) byName.set(k, [...byName.get(k) ?? [], note])
  }
  for (const note of notes) {
    const stem = posix.basename(note.path).replace(/\.(?:md|markdown)$/i, '')
    register(stem, note)
    note.aliases.forEach(alias => register(alias, note))
    if (FOLDER_NOTES.has(stem.toLowerCase()) && posix.dirname(note.path) !== '.') register(posix.basename(posix.dirname(note.path)), note)
  }
  /** The note nearest to `from` among `candidates`: the one sharing the longest folder path, if only one does. */
  const nearest = (from: Note, candidates: Note[]) => {
    const shared = (note: Note) => {
      const a = posix.dirname(from.path).split('/'), b = posix.dirname(note.path).split('/')
      let n = 0
      while (n < a.length && a[n] === b[n]) n++
      return n
    }
    const best = Math.max(...candidates.map(shared))
    const winners = candidates.filter(note => shared(note) === best)
    return winners.length === 1 ? winners[0] : undefined
  }
  const href = (from: Note, to: Note, fragment?: string) => {
    const path = posix.relative(from.dir, to.dir)
    return `${path ? `${path}/` : ''}${DOCUMENT_ENTRY}${fragment ? `#${headingSlug(fragment)}` : ''}`
  }

  const report: ImportReport = { documents: [], files: 0, unresolved: [] }
  const copied = new Map<string, string>()
  for (const note of notes) {
    const docDir = join(out, note.dir)
    const names = new Map<string, string>()
    /** A file inside the imported folder to its copy in the document's attachments; undefined for anything else. */
    const attach = (url: string) => {
      const [path = '', ...fragment] = url.split('#')
      let name = path
      try {
        name = decodeURIComponent(path)
      } catch {
      }
      const file = resolve(dirname(note.file), name)
      const rel = toPosix(relative(root, file))
      if (!name || rel.startsWith('../') || isExcluded(rel) || !statSync(file, { throwIfNoEntry: false })?.isFile()) return undefined
      const target = byPath.get(key(rel))
      if (target) return href(note, target, fragment.length ? fragment.join('#') : undefined)
      let copy = names.get(file)
      if (!copy) {
        const base = basename(file)
        copy = [...names.values()].includes(`${ATTACHMENTS}/${base}`) ? `${ATTACHMENTS}/${names.size}-${base}` : `${ATTACHMENTS}/${base}`
        names.set(file, copy)
      }
      copied.set(join(docDir, copy), file)
      return `${encodeURI(copy)}${fragment.length ? `#${fragment.join('#')}` : ''}`
    }
    const { document, unresolved } = markdownDocument(readFileSync(note.file, 'utf8'), {
      id: note.dir.replace(/\//g, '--'),
      title: note.title,
      lang: options.lang,
      links: {
        page: (target, fragment) => {
          const direct = byPath.get(key(target)) ?? byPath.get(key(posix.join(posix.dirname(note.path), target)))
          const candidates = byName.get(key(target)) ?? []
          const found = direct ?? (candidates.length === 1 ? candidates[0] : candidates.length > 1 ? nearest(note, candidates) : undefined)
          return found && href(note, found, fragment)
        },
        url: attach,
        image: attach,
      },
    })
    const folder = options.group ? posix.dirname(note.path).split('/').slice(0, options.group).at(-1) : undefined
    if (folder && folder !== '.') document.metadata.tags = [folder, ...(document.metadata.tags ?? []).filter(tag => tag !== folder)]
    mkdirSync(docDir, { recursive: true })
    writeFileSync(join(docDir, DOCUMENT_ENTRY), `${JSON.stringify(document, null, 2)}\n`)
    report.documents.push(note.dir)
    report.unresolved.push(...unresolved.map(link => ({ note: note.path, link })))
  }
  for (const [copy, file] of copied) {
    mkdirSync(dirname(copy), { recursive: true })
    if (!existsSync(copy) || statSync(copy).mtimeMs < statSync(file).mtimeMs || statSync(copy).size !== statSync(file).size) copyFileSync(file, copy)
  }
  report.files = copied.size
  return report
}

/** The `documents` patterns that cover these folders: one per depth, as workspace patterns do not cross folders. */
export function documentPatterns(dirs: string[]): string[] {
  return [...new Set(dirs.map(dir => dir.split('/').length))].sort((a, b) => a - b).map(depth => `${'*/'.repeat(depth)}${DOCUMENT_ENTRY}`)
}
