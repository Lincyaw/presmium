/**
 * Translations (P-123, docs/ir.md 2.12): the headmatter's `translations`
 * (language to the entry file of a translation, relative to the deck
 * directory) go to the IR's `config.translations`; a translation's
 * `translationOf` (the original's entry and the digest it follows) to
 * `meta.translationOf`, not among the other `meta` fields. WP-86 adds the
 * compilation of the translations and the staleness check here.
 */
import { isRecord } from '@presmium/kernel'
import type { IRDocument } from '@presmium/kernel'

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

/** Writes the translation fields into the IR: `config.translations` and `meta.translationOf`. */
export function applyTranslations(doc: IRDocument, fields: TranslationFields): void {
  if (fields.translations) doc.config.translations = fields.translations
  if (fields.translationOf) doc.meta.translationOf = fields.translationOf
}
