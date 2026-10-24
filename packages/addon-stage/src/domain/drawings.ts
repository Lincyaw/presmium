/** The pen's inks: drawn on the slides as they are, in light and in dark. */
export const INKS = ['#e5484d', '#2f6fde', '#2f9e44', '#f08c00'] as const

/** The pen's width on the slide's canvas. */
export const PEN_WIDTH = 3

/** What the pen does: draw (a stroke that follows the pen's pressure), or erase the strokes it crosses. */
export type PenMode = 'stylus' | 'eraseLine'

/** The file of a section's drawing below `DRAWINGS_DIR`. */
export function drawingFile(section: string): string {
  return `${encodeURIComponent(section)}.svg`
}

/** The section of a file below `DRAWINGS_DIR`, if it is a drawing's. */
export function drawingSection(file: string): string | undefined {
  if (!file.endsWith('.svg')) return undefined
  try {
    return decodeURIComponent(file.slice(0, -'.svg'.length))
  } catch {
    return undefined
  }
}
