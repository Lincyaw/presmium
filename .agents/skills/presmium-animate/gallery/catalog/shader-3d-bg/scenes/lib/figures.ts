// Figure cards drawn on a canvas, for scenes that show figures in space (a ring of figures, a sphere of samples, a
// before/after pair). A card is a small chart, a big number or a picture under a title, in the page's tokens, so
// it reads in both themes and needs no image file; a scene turns the canvas into a texture. Drawn once at build:
// the scene is built again when the theme changes.

export interface Figure {
  /** The line at the top of the card. */
  title?: string
  /** What the card shows: a curve, bars, points, one number, or `picture`. */
  kind?: 'line' | 'bars' | 'scatter' | 'number' | 'picture'
  /** The data of `line`, `bars` and `scatter`, any scale (bars start at zero). */
  values?: number[]
  /** The top of the value axis (default: the largest value): give two figures the same `max` to compare them. */
  max?: number
  /** For `bars`: the bar in the accent colour (default: the last). */
  highlight?: number
  /** For `number`: the text, e.g. `+12.4%`. */
  value?: string
  /** A small tag in the top corner, e.g. `示意` for illustrative data. */
  tag?: string
}

type Color = (name: string) => string

export interface CardStyle {
  color: Color
  /** The element whose CSS supplies the fonts (`--pm-font-sans`, `--pm-font-serif`). */
  root: HTMLElement
  width?: number
  height?: number
  /** Leave out the card's own background and border (for a picture that fills a frame). */
  bare?: boolean
}

export function fonts(root: HTMLElement) {
  const css = getComputedStyle(root)
  const sans = css.getPropertyValue('--pm-font-sans').trim() || 'sans-serif'
  const serif = css.getPropertyValue('--pm-font-serif').trim() || 'serif'
  const mono = css.getPropertyValue('--pm-font-mono').trim() || 'monospace'
  return { sans, serif, mono }
}

function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

/** One card on a new canvas (default 960 × 720). `picture` is drawn for kind `picture`, fitted to the plot area. */
export function drawFigure(figure: Figure, style: CardStyle, picture?: HTMLImageElement | null): HTMLCanvasElement {
  const W = style.width ?? 960, H = style.height ?? 720
  const { color } = style
  const f = fonts(style.root)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const g = canvas.getContext('2d')!
  const pad = Math.round(W * 0.05)
  if (!style.bare) {
    rounded(g, 3, 3, W - 6, H - 6, W * 0.03)
    g.fillStyle = color('surface')
    g.fill()
    g.lineWidth = 4
    g.strokeStyle = color('line-strong')
    g.stroke()
  }
  let top = pad
  if (figure.title) {
    g.fillStyle = color('ink')
    g.font = `600 ${Math.round(H * 0.06)}px ${f.sans}`
    g.textBaseline = 'alphabetic'
    g.fillText(figure.title, pad, pad + H * 0.05)
    top = pad + H * 0.1
  }
  if (figure.tag) {
    g.font = `500 ${Math.round(H * 0.034)}px ${f.sans}`
    const tw = g.measureText(figure.tag).width + H * 0.04
    rounded(g, W - pad - tw, pad, tw, H * 0.055, H * 0.0275)
    g.fillStyle = color('sunk')
    g.fill()
    g.fillStyle = color('muted')
    g.textAlign = 'center'
    g.fillText(figure.tag, W - pad - tw / 2, pad + H * 0.04)
    g.textAlign = 'left'
  }
  // The plot area.
  const x0 = pad * 1.4, x1 = W - pad * 1.2, y0 = top + H * 0.04, y1 = H - pad * 1.2
  const kind = figure.kind ?? (picture ? 'picture' : 'line')
  const values = figure.values ?? []
  const max = figure.max ?? Math.max(1e-9, ...values.map(Math.abs))
  const axes = () => {
    g.strokeStyle = color('line-strong')
    g.lineWidth = 3
    g.beginPath()
    g.moveTo(x0, y0)
    g.lineTo(x0, y1)
    g.lineTo(x1, y1)
    g.stroke()
  }
  if (kind === 'line' && values.length > 1) {
    axes()
    g.strokeStyle = color('accent')
    g.lineWidth = Math.max(4, W * 0.007)
    g.lineJoin = g.lineCap = 'round'
    g.beginPath()
    values.forEach((v, i) => {
      const x = x0 + (i / (values.length - 1)) * (x1 - x0 - 10) + 5
      const y = y1 - (v / max) * (y1 - y0) * 0.92
      if (i) g.lineTo(x, y)
      else g.moveTo(x, y)
    })
    g.stroke()
  } else if (kind === 'bars' && values.length) {
    axes()
    const hi = figure.highlight ?? values.length - 1
    const slot = (x1 - x0) / values.length
    values.forEach((v, i) => {
      const h = (Math.max(0, v) / max) * (y1 - y0) * 0.92
      g.fillStyle = color(i === hi ? 'accent' : 'accent-soft')
      g.fillRect(x0 + slot * (i + 0.2), y1 - h, slot * 0.6, h)
    })
    axes()
  } else if (kind === 'scatter' && values.length) {
    axes()
    g.fillStyle = color('accent')
    values.forEach((v, i) => {
      const x = x0 + ((i + 0.5) / values.length) * (x1 - x0)
      const y = y1 - (v / max) * (y1 - y0) * 0.92
      g.beginPath()
      g.arc(x, y, W * 0.009, 0, Math.PI * 2)
      g.fill()
    })
  } else if (kind === 'number') {
    g.fillStyle = color('accent')
    g.font = `600 ${Math.round(H * 0.26)}px ${f.serif}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(figure.value ?? '', W / 2, (y0 + y1) / 2)
    g.textAlign = 'left'
    g.textBaseline = 'alphabetic'
  } else if (picture) {
    const iw = picture.naturalWidth || (x1 - x0), ih = picture.naturalHeight || (y1 - y0)
    const k = Math.min((x1 - x0) / iw, (y1 - y0) / ih)
    g.drawImage(picture, (x0 + x1 - iw * k) / 2, (y0 + y1 - ih * k) / 2, iw * k, ih * k)
  }
  return canvas
}
