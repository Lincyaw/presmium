import { validateDocument } from '@lincyaw/kernel'
import type { DocumentIssue, PresmiumDocument } from '@lincyaw/kernel'

/** How many recently checked document texts are remembered. */
const REMEMBERED = 16
const remembered = new Map<string, { valid: boolean, issues: DocumentIssue[] }>()

function remember(text: string, valid: boolean, issues: DocumentIssue[]): void {
  remembered.delete(text)
  remembered.set(text, { valid, issues })
  while (remembered.size > REMEMBERED) remembered.delete(remembered.keys().next().value!)
}

/**
 * A document file's text parsed and validated. Checking a large document holds the event loop for milliseconds, and a
 * save checks the same text several times (the current file, the candidate, the readback), so the outcome for a
 * recent text is remembered: the text is parsed again (a fresh document every time) and its checks are not repeated.
 */
export function checkDocumentText(content: string): { document?: PresmiumDocument, issues: DocumentIssue[], syntax?: true } {
  const text = content.replace(/^﻿/, '')
  let value: unknown
  try { value = JSON.parse(text) } catch { return { issues: [], syntax: true } }
  const known = remembered.get(text)
  if (known) {
    remember(text, known.valid, known.issues)
    return { ...known.valid ? { document: value as PresmiumDocument } : {}, issues: known.issues.map(issue => ({ ...issue })) }
  }
  const checked = validateDocument(value)
  remember(text, Boolean(checked.document), checked.issues.map(issue => ({ ...issue })))
  return checked
}

/** A text about to be written whose document was just validated: reading it back does not check it again. */
export function rememberCheckedText(content: string, valid: boolean, issues: DocumentIssue[]): void {
  remember(content.replace(/^﻿/, ''), valid, issues.map(issue => ({ ...issue })))
}
