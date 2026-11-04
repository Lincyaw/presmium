import { randomBytes } from 'node:crypto'
import { readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { validateDocument } from '@lincyaw/kernel'
import type { TeachingDocument } from '@lincyaw/kernel'

/** `lecture.json` as it was read: its exact text, to save a change in the same formatting and only if it is unchanged. */
export interface DocumentFile {
  entry: string
  text: string
  document: TeachingDocument
}

export class DocumentFileError extends Error {
  readonly code: 'document-invalid' | 'document-changed'
  readonly detail: string
  constructor(code: DocumentFileError['code'], detail = '') {
    super(code)
    this.code = code
    this.detail = detail
  }
}

const BOM = String.fromCharCode(0xfeff)
const issuesOf = (checked: ReturnType<typeof validateDocument>) => checked.issues.slice(0, 3).map(issue => `${issue.path || '/'}: ${issue.message}`).join('; ')

export function readDocumentFile(entry: string): DocumentFile {
  const text = readFileSync(entry, 'utf8')
  let value: unknown
  try { value = JSON.parse(text.startsWith(BOM) ? text.slice(1) : text) }
  catch (error) { throw new DocumentFileError('document-invalid', error instanceof Error ? error.message : String(error)) }
  const checked = validateDocument(value)
  if (!checked.document) throw new DocumentFileError('document-invalid', issuesOf(checked))
  return { entry, text, document: checked.document }
}

/**
 * Validates the changed document as the workspace does before saving, then replaces the file atomically in its own
 * indentation, line endings and byte order mark, so that the change is the only difference. Refuses when the file
 * changed since it was read (another editor saved it).
 */
export function saveDocumentFile(file: DocumentFile, document: TeachingDocument): void {
  const checked = validateDocument(document)
  if (!checked.document) throw new DocumentFileError('document-invalid', issuesOf(checked))
  const body = file.text.startsWith(BOM) ? file.text.slice(1) : file.text
  const indent = /^\{\r?\n([ \t]+)"/.exec(body)?.[1] ?? '  '
  const newline = body.includes('\r\n') ? '\r\n' : '\n'
  let text = JSON.stringify(checked.document, null, indent)
  if (newline !== '\n') text = text.replaceAll('\n', newline)
  if (body.endsWith('\n')) text += newline
  if (body !== file.text) text = BOM + text
  if (readFileSync(file.entry, 'utf8') !== file.text) throw new DocumentFileError('document-changed')
  const temporary = `${file.entry}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`
  try {
    writeFileSync(temporary, text, { flag: 'wx', mode: statSync(file.entry).mode & 0o777 })
    renameSync(temporary, file.entry)
  } finally {
    rmSync(temporary, { force: true })
  }
}
