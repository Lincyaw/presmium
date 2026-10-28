// Line icons for the pieces that show things instead of naming them: the four forms of a document and the files
// a lecture used to be scattered over. 48×48 boxes, drawn in currentColor, so a parent's `color` tints them.
const SVG = (body: string, className = '') => `<svg class="lf-icon ${className}" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`

export const ICONS = {
  web: SVG('<circle cx="24" cy="24" r="17" /><path d="M7 24 H41 M24 7 C17 13 17 35 24 41 M24 7 C31 13 31 35 24 41" />'),
  slides: SVG('<rect x="6" y="9" width="36" height="24" rx="3" /><path d="M24 33 V40 M16 40 H32 M12 16 H26 M12 22 H22" />'),
  notebook: SVG('<rect x="9" y="6" width="30" height="36" rx="3" /><path d="M15 15 H33 M15 24 H33 M15 33 H27" /><path d="M9 15 H6 M9 24 H6 M9 33 H6" />'),
  video: SVG('<rect x="5" y="10" width="38" height="28" rx="5" /><path d="M20 17 L31 24 L20 31 Z" fill="currentColor" />'),
  pencil: SVG('<path d="M10 38 L12 30 L32 10 L38 16 L18 36 Z M28 14 L34 20" />'),
}

/** A file card: a page with a folded corner and a coloured badge naming its type. */
export function fileCard(ext: string, tint: string, className = ''): string {
  return `<svg class="lf-file ${className}" viewBox="0 0 80 100" aria-hidden="true">
    <path d="M6 4 H54 L74 24 V96 H6 Z" fill="var(--pm-color-surface)" stroke="var(--pm-color-line-strong)" stroke-width="3" stroke-linejoin="round" />
    <path d="M54 4 V24 H74" fill="none" stroke="var(--pm-color-line-strong)" stroke-width="3" stroke-linejoin="round" />
    <path class="lf-file__line" d="M16 40 H58 M16 52 H52 M16 64 H46" stroke="var(--pm-color-line)" stroke-width="5" stroke-linecap="round" />
    <rect x="12" y="72" width="44" height="18" rx="4" fill="${tint}" />
    <text x="34" y="85.5" text-anchor="middle" font-size="12" font-weight="500" fill="var(--pm-color-surface)" font-family="var(--pm-font-mono)">${ext}</text>
  </svg>`
}
