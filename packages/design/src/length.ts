/** Resolve a geometric design token in the element's actual root-font scale. Browser UI only. */
export function designLength(name: `--pm-${string}`, element: Element = document.documentElement): number {
  const value = getComputedStyle(element).getPropertyValue(name).trim()
  const match = /^([\d.]+)(rem|px)$/.exec(value)
  if (!match) throw new Error(`Invalid design length: ${name}`)
  return Number(match[1]) * (match[2] === 'rem' ? Number.parseFloat(getComputedStyle(document.documentElement).fontSize) : 1)
}
