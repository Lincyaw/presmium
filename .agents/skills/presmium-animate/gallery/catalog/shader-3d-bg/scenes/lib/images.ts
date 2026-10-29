// Pictures a Three.js scene draws on its cards, decoded inside the scene's async `threeScene` build so the first
// frame already shows them: `const pictures = await decodePictures(sources, color)`. The viewer loads the page's fonts
// before the build, so titles drawn on a canvas use them.
// A source is SVG markup (`<svg …>`, e.g. a file imported with `?raw`) or a URL the page can load; a picture that
// fails to decode is `null`, and the card draws its own figure instead. An image ignores the page's CSS, so in SVG
// markup `var(--pm-color-<name>)` and `currentColor` are replaced by the token's colour (ink) before decoding: a
// diagram drawn in tokens reads in both themes.
export type Picture = HTMLImageElement | null

async function decode(source: string, color: (name: string) => string): Promise<Picture> {
  let text = source.trim()
  if (!text) return null
  const svg = text.startsWith('<svg') || text.startsWith('<?xml')
  if (svg) text = text.replace(/var\(--pm-color-([a-z-]+)\)/g, (_, name: string) => color(name)).replace(/currentColor/g, color('ink'))
  const url = svg ? URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' })) : text
  const image = new Image()
  image.decoding = 'sync'
  image.src = url
  try {
    await image.decode()
    return image
  } catch {
    return null
  } finally {
    if (svg) URL.revokeObjectURL(url)
  }
}

/** The pictures `sources` names, decoded, in order (`null` for a missing or broken one). */
export async function decodePictures(sources: (string | undefined)[], color: (name: string) => string): Promise<Picture[]> {
  return Promise.all(sources.map(s => (s ? decode(s, color) : Promise.resolve(null))))
}
