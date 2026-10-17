/**
 * The line icons of the design (N-10, docs/design/): 24 px boxes, drawn with
 * the current colour at a 1.7 px stroke; no emoji. `PmIcon` draws them.
 */

type Shape = ['path', { d: string }] | ['circle', { cx: number, cy: number, r: number }] | ['rect', { x: number, y: number, width: number, height: number, rx: number }]

const path = (d: string): Shape => ['path', { d }]
const circle = (cx: number, cy: number, r: number): Shape => ['circle', { cx, cy, r }]

export const ICONS = {
  /** A page with a folded corner: documents. */
  'document': [path('M6 3h8l4 4v14H6z'), path('M14 3v4h4')],
  'search': [circle(11, 11, 7), path('m20 20-3.5-3.5')],
  /** Commits on a branch: the revision history. */
  'history': [circle(6, 6, 2), circle(6, 18, 2), circle(18, 9, 2), path('M6 8v8M18 11c0 4-6 3-10 6')],
  /** Two people: the classroom. */
  'people': [circle(9, 8, 3), path('M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6'), path('M16 5.5a3 3 0 0 1 0 5M21 20c0-2.6-1.6-4.8-4-5.6')],
  /** A question mark in a circle: the usage guide. */
  'help': [circle(12, 12, 9), path('M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14'), path('M12 17.5v.01')],
  /** Two sliders: settings (the model's). */
  'sliders': [path('M4 7h10M18 7h2M4 17h4M12 17h8'), circle(16, 7, 2), circle(10, 17, 2)],
  'plus': [path('M12 5v14M5 12h14')],
  /** A four-pointed star: what the AI does. */
  'sparkle': [path('M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z')],
  'edit': [path('M4 20h4L19 9l-4-4L4 16z'), path('m13.5 6.5 4 4')],
  'close': [path('M6 6l12 12M18 6 6 18')],
  'copy': [['rect', { x: 8, y: 8, width: 12, height: 12, rx: 2 }], path('M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2')],
  'check': [path('m5 12 4.5 4.5L19 7')],
  /** A branch: git. */
  'branch': [circle(6, 5, 2), circle(6, 19, 2), circle(18, 7, 2), path('M6 7v10M18 9c0 4-4 4-10 7')],
  'chevron-right': [path('m9 6 6 6-6 6')],
  'chevron-left': [path('m15 6-6 6 6 6')],
  'chevron-down': [path('m6 9 6 6 6-6')],
  'folder': [path('M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2h8.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z')],
  'undo': [path('M9 7 4 12l5 5'), path('M4 12h11a5 5 0 0 1 0 10h-3')],
  'redo': [path('m15 7 5 5-5 5'), path('M20 12H9a5 5 0 0 0 0 10h3')],
  'sun': [circle(12, 12, 4), path('M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')],
  'moon': [path('M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z')],
  'more': [circle(5, 12, 1), circle(12, 12, 1), circle(19, 12, 1)],
  /** A screen on a stand: the slides. */
  'slides': [['rect', { x: 2, y: 3, width: 20, height: 14, rx: 2 }], path('M8 21h8M12 17v4')],
  'external': [path('M14 4h6v6M20 4l-9 9'), path('M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5')],
  'trash': [path('M4 7h16M10 11v6M14 11v6'), path('M6 7l1 13h10l1-13M9 7V4h6v3')],
  'play': [path('M7 4v16l13-8z')],
  /** A triangle with a mark: a warning (e.g. a caption older than its script). */
  'warning': [path('M12 3.5 2.5 20h19z'), path('M12 10v4.5'), path('M12 17.5v.01')],
  /** A circle half drawn in: the high-contrast switch. */
  'contrast': [circle(12, 12, 9), path('M12 17.5a5.5 5.5 0 0 0 0-11z')],
  /** A ring round a dot: recording. */
  'record': [circle(12, 12, 8), circle(12, 12, 3.5)],
  /** A plug: connecting an outside agent (MCP). */
  'plug': [path('M9 3v5M15 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v4')],
  'arrow-left': [path('M19 12H5M11 6l-6 6 6 6')],
} satisfies Record<string, Shape[]>

export type IconName = keyof typeof ICONS

/**
 * An icon as SVG markup, for text that a framework renders as HTML (e.g. a
 * code runner's output in the slides): `size` is a CSS length, `1em` follows
 * the text. Hidden from assistive technology; the text around it says what it
 * means.
 */
export function iconMarkup(name: IconName, size = '1em', strokeWidth = 1.7): string {
  const shapes = ICONS[name].map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([key, value]) => `${key}="${value}"`).join(' ')}/>`).join('')
  return `<svg class="pm-ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes}</svg>`
}
