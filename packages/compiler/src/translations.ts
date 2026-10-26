import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { DOCUMENT_ENTRY, errorMessage, isRecord, validateDocument } from '@lincyaw/kernel'
import type { Finding, IRDocument, TeachingDocument } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import type { AudienceCompilation, Compilation, Compiler, CompilerOptions } from './compiler.ts'

const CHECK_ID = 'presmium.translations'
const pointerKey = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1')
const sourceAt = (file: string, pointer: string) => ({ file, line: 1, format: 'json' as const, pointer })

export interface TranslationFields {
  translations?: Record<string, string>
  translationOf?: { entry: string, digest: string }
}

export function translationFields(metadata: Record<string, unknown>): TranslationFields {
  const fields: TranslationFields = {}
  const { translations, translationOf } = metadata
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

function documentValue(text: string): TeachingDocument {
  const checked = validateDocument(JSON.parse(text.replace(/^\uFEFF/, '')))
  if (!checked.document) throw new Error(checked.issues.map(issue => `${issue.path || '/'}: ${issue.message}`).join('\n'))
  return checked.document
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted)
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])]))
  return value
}

/** Translation bookkeeping and JSON formatting do not change the original's content digest. */
export function documentDigest(document: TeachingDocument): string {
  const metadata = { ...document.metadata }
  delete metadata.translations
  delete metadata.translationOf
  return createHash('sha256').update(JSON.stringify(sorted({ ...document, metadata }))).digest('hex')
}

export function originalDigest(doc: IRDocument): string {
  return documentDigest(documentValue(readFileSync(doc.meta.entry, 'utf8')))
}

function translationFile(deckDir: string, entry: string): string | undefined {
  const file = resolve(deckDir, entry)
  if (basename(file) !== DOCUMENT_ENTRY) return undefined
  try {
    return statSync(file).isFile() && isInside(realpathSync(file), realpathSync(deckDir)) ? file : undefined
  } catch {
    return undefined
  }
}

function staleTranslations(doc: IRDocument, translations: Record<string, string>): Finding[] {
  const deckDir = dirname(doc.meta.entry)
  const original = basename(doc.meta.entry)
  let digest: string | undefined
  const findings: Finding[] = []
  for (const [lang, entry] of Object.entries(translations)) {
    const file = translationFile(deckDir, entry)
    const name = `translation "${lang}" (${entry})`
    if (!file || file === doc.meta.entry) {
      findings.push({ checkId: CHECK_ID, severity: 'warning', message: `${name} must name a distinct ${DOCUMENT_ENTRY} inside the document's directory`, source: sourceAt(doc.meta.entry, `/metadata/translations/${pointerKey(lang)}`) })
      continue
    }
    const at = (pointer: string) => sourceAt(file, pointer)
    try {
      digest ??= originalDigest(doc)
      const { translationOf } = documentValue(readFileSync(file, 'utf8')).metadata
      const expected = relative(dirname(file), doc.meta.entry).split(sep).join('/')
      if (!translationOf) {
        findings.push({ checkId: CHECK_ID, severity: 'warning', message: `${name} records no digest of the original; once it matches the original, set metadata.translationOf to { entry: ${expected}, digest: ${digest} }`, source: at('/metadata') })
      } else if (resolve(dirname(file), translationOf.entry) !== doc.meta.entry) {
        findings.push({ checkId: CHECK_ID, severity: 'warning', message: `${name} names ${translationOf.entry} as its original, not ${original}`, source: at('/metadata/translationOf/entry') })
      } else if (translationOf.digest !== digest) {
        findings.push({ checkId: CHECK_ID, severity: 'warning', message: `${name} is out of date: the original changed since digest ${translationOf.digest.slice(0, 12)}…; check the translation against it, then set translationOf.digest to ${digest}`, source: at('/metadata/translationOf/digest') })
      }
    } catch (error) {
      findings.push({ checkId: CHECK_ID, severity: 'error', message: `${name} is not a valid teaching document: ${errorMessage(error)}`, source: at('') })
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
  const { doc, deckDir } = compilation
  const translations: CompiledTranslation[] = []
  const findings: Finding[] = []
  const { Compiler } = await import('./compiler.ts')
  const { audience: _audience, headmatter: _headmatter, deckDir: _deckDir, ...base } = compilation.options
  const audience = compilation.audience?.name
  for (const [lang, entry] of Object.entries(doc.config.translations ?? {})) {
    const file = translationFile(deckDir, entry)
    if (!file || file === doc.meta.entry) continue
    try {
      const options: CompilerOptions = { ...base, ...audience ? { audience } : {} }
      const known = compilers.get(file)
      const same = known && known.options.audience === options.audience
      const compiler = same ? known : new Compiler(file, options)
      compilers.set(file, compiler)
      const translated = await compiler.compile()
      findings.push(...translated.doc.diagnostics)
      translations.push({ lang, doc: translated.doc, files: [...new Set([...translated.sourceFiles, ...translated.inputs.files])], ...translated.audience ? { audience: translated.audience } : {} })
    } catch (error) {
      findings.push({ checkId: CHECK_ID, severity: 'error', message: `translation "${lang}" (${entry}) could not be compiled: ${errorMessage(error)}`, source: sourceAt(file, '') })
    }
  }
  return { translations, findings }
}
