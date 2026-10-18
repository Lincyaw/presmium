/**
 * Translations (P-123, docs/ir.md 2.12): the headmatter's `translations`
 * (language to the entry file of a translation, relative to the deck
 * directory) go to the IR's `config.translations`; a translation's
 * `translationOf` (the original's entry and the digest it follows) to
 * `meta.translationOf`, not among the other `meta` fields.
 *
 * Compiling the original checks each translation it declares
 * (`presmium.translations`, a warning): a translation that is missing,
 * records no digest, or follows another digest than the original's now is
 * reported with the new digest, which the translator writes back once the
 * translation matches. `compileTranslations` compiles them for the web
 * renderer (`RenderContext.translations`) with the original's plugins and
 * renderer configuration, and for the original's audience when it was
 * compiled for one (P-55).
 */
import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { errorMessage, irBlocks, isRecord } from '@presmium/kernel'
import type { Finding, IRDocument } from '@presmium/kernel'
import type { AudienceCompilation, Compilation, Compiler, CompilerOptions } from './compiler.ts'
import { readFrontmatter } from './source.ts'

const CHECK_ID = 'presmium.translations'

/** The headmatter keys a translation takes from its original: the plugins and the renderer configuration. */
const ORIGINAL_KEYS = ['plugins', 'presmium', 'renderers', 'execute', 'sectionDepth', 'checks']

export interface TranslationFields {
  translations?: Record<string, string>
  translationOf?: { entry: string, digest: string }
}

/** The translation fields of a headmatter, as the IR holds them; malformed ones are left out. */
export function translationFields(headmatter: Record<string, unknown>): TranslationFields {
  const fields: TranslationFields = {}
  const { translations, translationOf } = headmatter
  if (isRecord(translations)) {
    const entries = Object.entries(translations).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)
    if (entries.length > 0) fields.translations = Object.fromEntries(entries)
  }
  if (isRecord(translationOf) && typeof translationOf.entry === 'string' && typeof translationOf.digest === 'string') {
    fields.translationOf = { entry: translationOf.entry, digest: translationOf.digest }
  }
  return fields
}

/**
 * Writes the translation fields into the IR, `config.translations` and
 * `meta.translationOf`, and reports what is wrong with the translations an
 * original declares (`report`, the compilation's findings).
 */
export function applyTranslations(doc: IRDocument, fields: TranslationFields, report: (finding: Finding) => void): void {
  if (fields.translations) doc.config.translations = fields.translations
  if (fields.translationOf) doc.meta.translationOf = fields.translationOf
  if (fields.translations) staleTranslations(doc, fields.translations).forEach(report)
}

/** A file's text as the digest reads it: without byte order mark and frontmatter, with `\n` line breaks and no trailing white space. */
function body(text: string): string {
  return text.replace(/^﻿/, '').replace(/^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/, '').replace(/\r\n?/g, '\n').trimEnd()
}

/**
 * The digest of an original (docs/ir.md 2.12): the sha256 of its title and
 * of the text of its entry and of the files it includes, in the order they
 * come, each without frontmatter. Only the content counts, not the paths.
 */
export function originalDigest(doc: IRDocument): string {
  const files = [doc.meta.entry]
  for (const section of doc.sections) {
    for (const { file } of [section.source, ...[...irBlocks(section.blocks)].map(block => block.source)]) if (!files.includes(file)) files.push(file)
  }
  const hash = createHash('sha256').update(doc.meta.title)
  for (const file of files) {
    let text: string
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    hash.update('\0').update(body(text))
  }
  return hash.digest('hex')
}

/**
 * The entry file of a translation, when it is a file in the deck's
 * directory (or under it) by its real path: a translation is the deck's own
 * file, never one a symbolic link names elsewhere.
 */
function translationFile(deckDir: string, entry: string): string | undefined {
  const file = resolve(deckDir, entry)
  try {
    const rel = relative(realpathSync(deckDir), realpathSync(file))
    return statSync(file).isFile() && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel) ? file : undefined
  } catch {
    return undefined
  }
}

/** 1-based line of the first line of `text` that holds `needle`; 1 when none does. */
function lineWith(text: string, needle: string): number {
  const index = text.split(/\r?\n/).findIndex(line => line.includes(needle))
  return index < 0 ? 1 : index + 1
}

/** The findings of an original's translations: missing, recording no digest, or following an older one. */
function staleTranslations(doc: IRDocument, translations: Record<string, string>): Finding[] {
  const deckDir = dirname(doc.meta.entry)
  const original = basename(doc.meta.entry)
  const entryText = readFileSync(doc.meta.entry, 'utf8')
  let digest: string | undefined
  const findings: Finding[] = []
  for (const [lang, entry] of Object.entries(translations)) {
    const file = translationFile(deckDir, entry)
    const name = `translation "${lang}" (${entry})`
    if (!file) {
      findings.push({ checkId: CHECK_ID, severity: 'warning', message: `${name} not found in the deck's directory`, source: { file: doc.meta.entry, line: lineWith(entryText, entry) } })
      continue
    }
    const text = readFileSync(file, 'utf8')
    digest ??= originalDigest(doc)
    const { translationOf } = translationFields(readFrontmatter(text))
    const expected = relative(dirname(file), doc.meta.entry).split(sep).join('/')
    if (!translationOf) {
      findings.push({ checkId: CHECK_ID, severity: 'warning', message: `${name} records no digest of the original; once it matches the original, add translationOf: { entry: ${expected}, digest: ${digest} } to its headmatter`, source: { file, line: 1 } })
    } else if (resolve(dirname(file), translationOf.entry) !== doc.meta.entry) {
      findings.push({ checkId: CHECK_ID, severity: 'warning', message: `${name} names ${translationOf.entry} as its original, not ${original}`, source: { file, line: lineWith(text, 'entry') } })
    } else if (translationOf.digest !== digest) {
      findings.push({ checkId: CHECK_ID, severity: 'warning', message: `${name} is out of date: the original changed since digest ${translationOf.digest.slice(0, 12)}…; check the translation against it, then set translationOf.digest to ${digest}`, source: { file, line: lineWith(text, translationOf.digest) } })
    }
  }
  return findings
}

/** A translation compiled for the web renderer. */
export interface CompiledTranslation {
  lang: string
  doc: IRDocument
  /** The files it read, its entry first: a dev server watches them. */
  files: string[]
  /** Set when compiled for the original's audience: what it left out, for the scan of a build. */
  audience?: AudienceCompilation
}

/**
 * Compiles the translations the original declares (those that exist), each
 * from its own entry file, with its own title, language and text and the
 * original's plugins and renderer configuration (`CompilerOptions.headmatter`),
 * as a file of the original's deck (`CompilerOptions.deckDir`: the deck's
 * plugins, public files and components); with the original's compiler
 * options, and for the audience the original was compiled for, or whose view
 * it is (`Compilation.audience`). `compilers` keeps their compilers from one
 * compilation of the original to the next (`presmium dev`).
 */
export async function compileTranslations(compilation: Compilation, compilers = new Map<string, Compiler>()): Promise<{ translations: CompiledTranslation[], findings: Finding[] }> {
  const { doc, deckDir, frontmatter } = compilation
  const translations: CompiledTranslation[] = []
  const findings: Finding[] = []
  // Imported when used: the compiler imports this module.
  const { Compiler } = await import('./compiler.ts')
  const { audience: _audience, headmatter: _headmatter, deckDir: _deckDir, ...base } = compilation.options
  const audience = compilation.audience?.name
  for (const [lang, entry] of Object.entries(doc.config.translations ?? {})) {
    const file = translationFile(deckDir, entry)
    if (!file) continue
    try {
      const own = readFrontmatter(await readFile(file, 'utf8'))
      const headmatter: Record<string, unknown> = { translations: undefined }
      for (const key of ORIGINAL_KEYS) headmatter[key] = frontmatter[key]
      if (!(typeof own.lang === 'string' && own.lang.trim())) headmatter.lang = lang
      if (own.title === undefined) headmatter.title = doc.meta.title
      const options: CompilerOptions = { ...base, headmatter, deckDir, ...audience ? { audience } : {} }
      const known = compilers.get(file)
      const same = known && JSON.stringify(known.options.headmatter) === JSON.stringify(headmatter) && known.options.audience === options.audience
      const compiler = same ? known : new Compiler(file, options)
      compilers.set(file, compiler)
      const translated = await compiler.compile()
      findings.push(...translated.doc.diagnostics)
      translations.push({ lang, doc: translated.doc, files: [...new Set([...translated.files, ...translated.dependencies.files])], ...translated.audience ? { audience: translated.audience } : {} })
    } catch (error) {
      findings.push({ checkId: CHECK_ID, severity: 'error', message: `translation "${lang}" (${entry}) could not be compiled: ${errorMessage(error)}`, source: { file, line: 1 } })
    }
  }
  return { translations, findings }
}
