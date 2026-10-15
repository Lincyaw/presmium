/**
 * Line-level Markdown rewrites of the web form (Downgrade rules). Lines inside
 * fenced code blocks are never rewritten.
 */

const FENCE = /^\s*(`{3,}|~{3,})(.*)$/

interface Line {
  text: string
  /** `open` and `close` are fence lines; `code` is inside a fence. */
  kind: 'text' | 'code' | 'open' | 'close'
}

function scan(markdown: string): Line[] {
  const lines: Line[] = []
  let open: string | undefined
  for (const text of markdown.split(/\r?\n/)) {
    const fence = FENCE.exec(text)
    const marker = fence?.[1]
    const info = fence?.[2] ?? ''
    if (open) {
      const closes = marker !== undefined && marker[0] === open[0] && marker.length >= open.length && !info.trim()
      lines.push({ text, kind: closes ? 'close' : 'code' })
      if (closes) open = undefined
    } else if (marker && !(marker[0] === '`' && info.includes('`'))) {
      open = marker
      lines.push({ text, kind: 'open' })
    } else {
      lines.push({ text, kind: 'text' })
    }
  }
  return lines
}

/** Rewrites the lines outside fenced code; `undefined` drops a line. */
function mapText(markdown: string, rewrite: (line: string) => string | undefined): string {
  return scan(markdown)
    .map(line => (line.kind === 'text' ? rewrite(line.text) : line.text))
    .filter(line => line !== undefined)
    .join('\n')
}

/** Escapes text for a double-quoted HTML attribute. */
export function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

/** Heading slug: letters and digits of any script joined by `-`. */
export function slugify(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

const HEADING = /^(#{1,6})(\s+.*)$/

/** Text of the first ATX heading outside code, without inline Markdown. */
export function firstHeading(markdown: string): string | undefined {
  const line = scan(markdown).find(l => l.kind === 'text' && HEADING.test(l.text))
  const text = line?.text
    .replace(/^#{1,6}\s+/, '')
    .replace(/\s*\{[#.][^}]*\}\s*$/, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[*_`~]/g, '')
    .trim()
  return text || undefined
}

/**
 * Makes the first heading the section heading `## <text> {#anchor}` (adding
 * `## <title>` when the slide has none) and shifts the other headings by the
 * same number of levels, keeping them below it.
 */
export function sectionHeadings(markdown: string, title: string, anchor: string): string {
  let shift: number | undefined
  const body = mapText(markdown, (line) => {
    const match = HEADING.exec(line)
    if (!match) return line
    if (shift === undefined) {
      shift = 2 - match[1]!.length
      return `## ${match[2]!.replace(/\s*\{[#.][^}]*\}\s*$/, '').trim()} {#${anchor}}`
    }
    return `${'#'.repeat(Math.min(Math.max(match[1]!.length + shift, 3), 6))}${match[2]}`
  })
  return shift === undefined ? `## ${title} {#${anchor}}\n\n${body}` : body
}

/** Moves every heading `by` levels down, so notes never compete with section headings. */
export function demoteHeadings(markdown: string, by: number): string {
  return mapText(markdown, line => line.replace(/^#{1,6}(?=\s)/, h => '#'.repeat(Math.min(h.length + by, 6))))
}

/** Removes `magic-move` wrappers so their steps read as consecutive code blocks. */
function unwrapMagicMove(markdown: string): string {
  const out: string[] = []
  let closing: RegExp | undefined
  for (const line of markdown.split(/\r?\n/)) {
    const fence = FENCE.exec(line)
    if (closing?.test(line)) closing = undefined
    else if (!closing && fence && /\bmagic-move\b/.test(fence[2]!)) closing = new RegExp(`^\\s*\\${fence[1]![0]}{${fence[1]!.length},}\\s*$`)
    else out.push(line)
  }
  return out.join('\n')
}

/**
 * Slidev-only syntax that the web form drops: layout slot markers (`::right::`)
 * so slots read in order, click highlights and options in fence info
 * (`ts {1|3}{lines:true}`), and `magic-move` wrappers around their steps.
 * `v-click` and friends stay: the web theme implements them.
 */
export function downgrade(markdown: string): string {
  return scan(unwrapMagicMove(markdown))
    .map((line) => {
      // Static line highlights such as `{1,3-4}` are VitePress syntax too and stay.
      if (line.kind === 'open') return line.text.replace(/\s*\{[^}]*\}/g, m => (/^\s*\{[\d,\s-]+\}$/.test(m) ? m : ''))
      if (line.kind === 'text' && /^\s*::[\w.-]+::\s*$/.test(line.text)) return undefined
      return line.text
    })
    .filter(line => line !== undefined)
    .join('\n')
}

export interface NoteSegment {
  /** Step at which this part of the notes applies; 0 before the first `[click]`. */
  step: number
  markdown: string
}

const CLICK_MARKER = /^(\s*(?:[-*+]\s+|\d+[.)]\s+)?)\[click(?::(\d+))?\]\s?/

/**
 * Splits notes at Slidev click markers: `[click]` advances one step,
 * `[click:n]` advances n steps. Markers may follow a list bullet.
 */
export function splitNotes(notes: string | undefined): NoteSegment[] {
  if (!notes?.trim()) return []
  const segments: { step: number, lines: string[] }[] = [{ step: 0, lines: [] }]
  let step = 0
  for (const line of scan(notes)) {
    const marker = line.kind === 'text' ? CLICK_MARKER.exec(line.text) : null
    if (marker) {
      step += marker[2] ? Number(marker[2]) : 1
      segments.push({ step, lines: [marker[1]! + line.text.slice(marker[0].length)] })
    } else {
      segments.at(-1)!.lines.push(line.text)
    }
  }
  return segments
    .map(s => ({ step: s.step, markdown: s.lines.join('\n').trim() }))
    .filter(s => s.markdown)
}
