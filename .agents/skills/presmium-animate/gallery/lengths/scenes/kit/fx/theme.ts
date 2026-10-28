// The page's appearance, read from a token colour at build (a scene is built again when the theme changes).

/** Relative luminance (0..1) of an `rgb()`/`rgba()` string, as `color(name)` returns it. */
export function luminance(rgb: string): number {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(v => {
    const c = Number(v) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** Whether the page is dark: pass `color('bg')`. Glows add light on a dark page and darken nothing on a light one. */
export const isDark = (bg: string) => luminance(bg) < 0.2

/** How strong a white highlight (sheen, hot core) should be: about half as strong on a dark page, where it carries further. */
export const glowAlpha = (bg: string, light = 0.45) => (isDark(bg) ? light * 0.55 : light)

/** How strong a halo in a colour (an accent glow) should be: such a halo muddies a light page and reads as light only on a dark one. */
export const accentGlow = (bg: string, light = 0.3, dark = 0.5) => (isDark(bg) ? dark : light)
