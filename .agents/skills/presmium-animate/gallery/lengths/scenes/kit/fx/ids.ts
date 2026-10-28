// SVG ids (filters, masks, clip paths, gradients, patterns) are page-wide: a film shows the same scene twice on one
// page, so every scene instance takes its own ids when it is built, never per render.
let next = 0

export function uid(prefix: string): string {
  next += 1
  return `${prefix}-${next.toString(36)}`
}
