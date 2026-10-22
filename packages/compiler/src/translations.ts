import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { errorMessage, irBlocks, isRecord } from '@lincyaw/kernel'
import type { Finding, IRDocument } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import type { AudienceCompilation, Compilation, Compiler, CompilerOptions } from './compiler.ts'
import { parseFrontmatter } from './parser.ts'
import { textLine } from './source-lines.ts'

const CHECK_ID = 'presmium.translations'

const ORIGINAL_KEYS = ['plugins', 'presmium', 'renderers', 'execute', 'sectionDepth', 'checks']

export interface TranslationFields {
  translations?: Record<string, string>
  translationOf?: { entry: string, digest: string }
}

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

export function applyTranslations(doc: IRDocument, fields: TranslationFields, report: (finding: Finding) => void): void {
  if (fields.translations) doc.config.translations = fields.translations
  if (fields.translationOf) doc.meta.translationOf = fields.translationOf
  if (fields.translations) staleTranslations(doc, fields.translations).forEach(report)
}

function body(text: string): string {
  return text.replace(/^﻿/, '').replace(/^---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/, '').replace(/\r\n?/g, '\n').trimEnd()
}

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

function translationFile(deckDir: string, entry: string): string | undefined {
  const file = resolve(deckDir, entry)
  try {
    return statSync(file).isFile() && isInside(realpathSync(file), realpathSync(deckDir)) ? file : undefined
  } catch {
    return undefined
  }
}

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
      findings.push({ checkId: CHECK_ID, severity: 'warning', message: `${name} not found in the deck's directory`, source: { file: doc.meta.entry, line: textLine(entryText, entry) } })
      continue
    }
    const text = readFileSync(file, 'utf8')
    digest ??= originalDigest(doc)
    const { translationOf } = translationFields(parseFrontmatter(text))
    const expected = relative(dirname(file), doc.meta.entry).split(sep).join('/')
    if (!translationOf) {
      findings.push({ checkId: CHECK_ID, severity: 'warning', message: `${name} records no digest of the original; once it matches the original, add translationOf: { entry: ${expected}, digest: ${digest} } to its headmatter`, source: { file, line: 1 } })
    } else if (resolve(dirname(file), translationOf.entry) !== doc.meta.entry) {
      findings.push({ checkId: CHECK_ID, severity: 'warning', message: `${name} names ${translationOf.entry} as its original, not ${original}`, source: { file, line: textLine(text, 'entry') } })
    } else if (translationOf.digest !== digest) {
      findings.push({ checkId: CHECK_ID, severity: 'warning', message: `${name} is out of date: the original changed since digest ${translationOf.digest.slice(0, 12)}…; check the translation against it, then set translationOf.digest to ${digest}`, source: { file, line: textLine(text, translationOf.digest) } })
    }
  }
  return findings
}

export interface CompiledTranslation {
  lang: string
  doc: IRDocument
  files: string[]
  audience?: AudienceCompilation
}

export async function compileTranslations(compilation: Compilation, compilers = new Map<string, Compiler>()): Promise<{ translations: CompiledTranslation[], findings: Finding[] }> {
  const { doc, deckDir, headmatter: original } = compilation
  const translations: CompiledTranslation[] = []
  const findings: Finding[] = []
  const { Compiler } = await import('./compiler.ts')
  const { audience: _audience, headmatter: _headmatter, deckDir: _deckDir, ...base } = compilation.options
  const audience = compilation.audience?.name
  for (const [lang, entry] of Object.entries(doc.config.translations ?? {})) {
    const file = translationFile(deckDir, entry)
    if (!file) continue
    try {
      const own = parseFrontmatter(await readFile(file, 'utf8'))
      const headmatter: Record<string, unknown> = { translations: undefined }
      for (const key of ORIGINAL_KEYS) headmatter[key] = original[key]
      if (!(typeof own.lang === 'string' && own.lang.trim())) headmatter.lang = lang
      if (own.title === undefined) headmatter.title = doc.meta.title
      const options: CompilerOptions = { ...base, headmatter, deckDir, ...audience ? { audience } : {} }
      const known = compilers.get(file)
      const same = known && JSON.stringify(known.options.headmatter) === JSON.stringify(headmatter) && known.options.audience === options.audience
      const compiler = same ? known : new Compiler(file, options)
      compilers.set(file, compiler)
      const translated = await compiler.compile()
      findings.push(...translated.doc.diagnostics)
      translations.push({ lang, doc: translated.doc, files: [...new Set([...translated.sourceFiles, ...translated.inputs.files])], ...translated.audience ? { audience: translated.audience } : {} })
    } catch (error) {
      findings.push({ checkId: CHECK_ID, severity: 'error', message: `translation "${lang}" (${entry}) could not be compiled: ${errorMessage(error)}`, source: { file, line: 1 } })
    }
  }
  return { translations, findings }
}
