// Shared by the product-ui scenes: reading parameters, device chrome (browser, window, phone, tablet) whose screen
// is either the author's own screenshot or a generic app drawn from tokens, and the pointer of the lengths kit.
export { POINTER, POINTER_CSS, atoms, DUR, EASE } from '../../../../lengths/scenes/kit/atoms.ts'
export { frame, pick, TYPE } from '../../../../lengths/scenes/kit/frame.ts'

/** HTML-escaped text: parameters are the author's text, never markup. */
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export const str = (p: Readonly<Record<string, unknown>>, key: string, fallback: string) => (typeof p[key] === 'string' ? p[key] as string : fallback)
export const num = (p: Readonly<Record<string, unknown>>, key: string, fallback: number) => (typeof p[key] === 'number' ? p[key] as number : fallback)
export function list<T>(p: Readonly<Record<string, unknown>>, key: string, fallback: T[]): T[] {
  const v = p[key]
  return Array.isArray(v) && v.length > 0 ? v as T[] : fallback
}

/** A colour of the design system at `pct` % over transparent, for shadows and tints. */
export const mix = (name: string, pct: number) => `color-mix(in srgb, var(--pm-color-${name}) ${pct}%, transparent)`

/** A soft shadow `h` cqw deep (depth from one value: offset, blur and strength grow together). */
export const shadow = (h: number) => `0 ${(h * 0.5).toFixed(2)}cqw ${(h * 2).toFixed(2)}cqw ${mix('shadow', Math.min(60, 18 + h * 8))}`

export type Variant = 'dashboard' | 'doc' | 'list' | 'slides' | 'chart'

/**
 * A generic app drawn with blocks of the design tokens (no product's look): the screen a scene shows when the
 * author gives no screenshot. The screen element is a size container, so the blocks scale with it.
 */
export function skeleton(variant: Variant = 'dashboard'): string {
  // headings are ink at 70%, so a drawn app reads as a page and not as black pills
  const bar = (w: number, tone = 'line-strong', h = 3.2) => `<i class="sk__bar" style="width:${w}%;height:${h}cqh;background:${tone === 'ink' ? mix('ink', 70) : `var(--pm-color-${tone})`}"></i>`
  if (variant === 'doc') {
    return `<div class="sk sk--doc"><div class="sk__page">${bar(18, 'accent', 1.6)}${bar(64, 'ink', 5.5)}${bar(52, 'ink', 5.5)}<b></b>${[92, 88, 95, 60].map(w => bar(w)).join('')}<b></b><div class="sk__formula">${bar(40, 'muted', 5)}</div>${[90, 84, 70].map(w => bar(w)).join('')}</div></div>`
  }
  if (variant === 'list') {
    return `<div class="sk sk--list">${bar(30, 'ink', 4.5)}${[0, 1, 2, 3, 4].map(i => `<div class="sk__row"><i class="sk__dot"${i === 1 ? ' style="background:var(--pm-color-accent)"' : ''}></i><div>${bar([70, 55, 80, 62, 48][i]!, 'ink', 3.6)}${bar([45, 38, 52, 30, 40][i]!)}</div></div>`).join('')}</div>`
  }
  if (variant === 'slides') {
    return `<div class="sk sk--slides"><div class="sk__thumbs">${[0, 1, 2, 3].map(i => `<i class="sk__thumb${i === 1 ? ' is-on' : ''}"></i>`).join('')}</div><div class="sk__slide">${bar(50, 'ink', 6)}<div class="sk__cols"><div>${[80, 70, 76].map(w => bar(w)).join('')}</div><i class="sk__figure"></i></div></div></div>`
  }
  if (variant === 'chart') {
    return `<div class="sk sk--chart">${bar(34, 'ink', 4.5)}<div class="sk__plot">${[38, 52, 46, 70, 64, 88].map((h, i) => `<i style="height:${h}%;background:var(--pm-color-${i === 5 ? 'accent' : 'line-strong'})"></i>`).join('')}</div></div>`
  }
  return `<div class="sk sk--dash"><div class="sk__side">${bar(70, 'accent', 3)}${[80, 64, 72, 58].map(w => bar(w)).join('')}</div><div class="sk__main">${bar(36, 'ink', 4.5)}<div class="sk__cards">${[0, 1, 2].map(i => `<div class="sk__card"><i class="sk__icon"${i === 0 ? ' style="background:var(--pm-color-accent)"' : ''}></i>${bar(70, 'ink', 3.4)}${bar(48)}</div>`).join('')}</div><div class="sk__plot">${[30, 46, 40, 62, 55, 78, 70].map(h => `<i style="height:${h}%"></i>`).join('')}</div></div></div>`
}

export const SKELETON_CSS = `
  .sk { position: absolute; inset: 0; background: var(--pm-color-surface); display: flex; gap: 3cqw; padding: 5cqh 4cqw; }
  .sk__bar { display: block; flex: none; border-radius: 99cqw; }
  .sk--doc { justify-content: center; }
  .sk__page { width: 62%; display: flex; flex-direction: column; gap: 2.4cqh; }
  .sk__page b { height: 1.5cqh; }
  .sk__formula { display: flex; justify-content: center; }
  .sk--list, .sk--chart { flex-direction: column; gap: 3.5cqh; padding: 7cqh 7cqw; }
  .sk__row { display: flex; align-items: center; gap: 3cqw; padding-bottom: 2.6cqh; border-bottom: 0.3cqw solid var(--pm-color-line); }
  .sk__row > div { flex: 1; display: flex; flex-direction: column; gap: 1.6cqh; }
  .sk__dot { width: 5cqw; height: 5cqw; flex: none; border-radius: 50%; background: var(--pm-color-sunk); border: 0.3cqw solid var(--pm-color-line-strong); }
  .sk--slides { padding: 0; gap: 0; }
  .sk__thumbs { width: 18%; display: flex; flex-direction: column; gap: 3cqh; padding: 4cqh 2.5cqw; background: var(--pm-color-sunk); border-right: 0.3cqw solid var(--pm-color-line); }
  .sk__thumb { aspect-ratio: 16 / 9; border-radius: 1cqw; background: var(--pm-color-surface); border: 0.3cqw solid var(--pm-color-line); }
  .sk__thumb.is-on { border-color: var(--pm-color-accent); }
  .sk__slide { flex: 1; display: flex; flex-direction: column; gap: 6cqh; padding: 9cqh 6cqw; }
  .sk__cols { display: flex; gap: 5cqw; }
  .sk__cols > div { flex: 1; display: flex; flex-direction: column; gap: 3cqh; }
  .sk__figure { width: 40%; aspect-ratio: 4 / 3; border-radius: 1.5cqw; background: var(--pm-color-accent-soft); border: 0.3cqw solid var(--pm-color-accent-line); }
  .sk__side { width: 20%; display: flex; flex-direction: column; gap: 3.5cqh; padding: 1cqh 0; }
  .sk__main { flex: 1; display: flex; flex-direction: column; gap: 4cqh; }
  .sk__cards { display: flex; gap: 2.5cqw; }
  .sk__card { flex: 1; display: flex; flex-direction: column; gap: 1.8cqh; padding: 3cqh 2cqw; border-radius: 1.5cqw; background: var(--pm-color-sunk); }
  .sk__icon { width: 5cqw; height: 5cqw; border-radius: 1.2cqw; background: var(--pm-color-accent-soft); margin-bottom: 1cqh; }
  .sk__plot { flex: 1; display: flex; align-items: flex-end; gap: 2cqw; padding: 2cqh 2cqw 0; border-bottom: 0.3cqw solid var(--pm-color-line-strong); }
  .sk__plot i { flex: 1; border-radius: 0.8cqw 0.8cqw 0 0; background: var(--pm-color-accent-soft); }
`

/** The screen: the author's screenshot (`image`, a URL or a path in the document's `public/`), else a drawn app. */
export function screen(image: string | undefined, variant: Variant = 'dashboard', alt = ''): string {
  return image
    ? `<img class="ui-shot" src="${esc(image)}" alt="${esc(alt)}" draggable="false" />`
    : skeleton(variant)
}

export const SCREEN_CSS = `
  .ui-screen { position: relative; overflow: hidden; container-type: size; background: var(--pm-color-surface); }
  .ui-shot { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: top center; display: block; }
  ${SKELETON_CSS}
`

export type Chrome = 'browser' | 'window' | 'phone' | 'tablet'

/**
 * Device chrome around a screen, sized by its parent (`.ui-device` fills it). Browser and window are drawn with
 * neutral dots and a hairline; phone and tablet are a rounded black bezel. `inner` is the screen's markup.
 */
export function device(kind: Chrome, inner: string, title = ''): string {
  if (kind === 'phone' || kind === 'tablet') {
    return `<div class="ui-device ui-device--${kind}"><div class="ui-screen">${inner}</div>${kind === 'phone' ? '<i class="ui-notch"></i>' : ''}</div>`
  }
  const bar = kind === 'browser'
    ? `<div class="ui-bar"><i></i><i></i><i></i><span class="ui-url">${esc(title)}</span></div>`
    : `<div class="ui-bar"><i></i><i></i><i></i><span class="ui-title">${esc(title)}</span></div>`
  return `<div class="ui-device ui-device--${kind}">${bar}<div class="ui-screen">${inner}</div></div>`
}

export const DEVICE_CSS = `
  ${SCREEN_CSS}
  .ui-device { position: absolute; inset: 0; display: flex; flex-direction: column; overflow: hidden; }
  .ui-device--browser, .ui-device--window { border-radius: 1.2cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line-strong); }
  .ui-device > .ui-screen { flex: 1; }
  .ui-bar { height: 4.6cqh; flex: none; display: flex; align-items: center; gap: 0.6cqw; padding: 0 1.2cqw; background: var(--pm-color-sunk); border-bottom: 0.15cqw solid var(--pm-color-line); position: relative; }
  .ui-bar i { width: 0.8cqw; height: 0.8cqw; border-radius: 50%; background: var(--pm-color-line-strong); }
  .ui-url { position: absolute; left: 50%; transform: translateX(-50%); min-width: 36%; padding: 0.35cqh 1.6cqw; border-radius: 99cqw; background: var(--pm-color-surface); border: 0.12cqw solid var(--pm-color-line); font: 1.15cqw var(--pm-font-mono); color: var(--pm-color-muted); text-align: center; white-space: nowrap; }
  .ui-title { position: absolute; left: 50%; transform: translateX(-50%); font-size: 1.2cqw; color: var(--pm-color-muted); white-space: nowrap; }
  /* the bezel is the terminal black, dark in both themes like a real device, with a hairline so it shows on a dark page */
  .ui-device--phone, .ui-device--tablet { background: var(--pm-color-terminal-bg); border: 0.15cqw solid var(--pm-color-line-strong); padding: 1.1cqw; border-radius: 3.6cqw; }
  .ui-device--tablet { border-radius: 2.2cqw; padding: 1.3cqw; }
  .ui-device--phone > .ui-screen { border-radius: 2.6cqw; }
  .ui-device--tablet > .ui-screen { border-radius: 1.1cqw; }
  .ui-notch { position: absolute; left: 50%; top: 2cqw; width: 28%; height: 1.4cqw; transform: translateX(-50%); border-radius: 99cqw; background: var(--pm-color-terminal-bg); }
`

/** A round avatar: the author's image, else the initials of `name` on the accent tint. */
export function avatar(name: string, image?: string, cls = 'ui-avatar'): string {
  const initials = [...name.trim()].slice(0, /[a-z]/i.test(name) ? 2 : 1).join('').toUpperCase()
  return image
    ? `<span class="${cls}"><img src="${esc(image)}" alt="" draggable="false" /></span>`
    : `<span class="${cls}">${esc(initials)}</span>`
}

export const AVATAR_CSS = `
  .ui-avatar { display: inline-grid; place-items: center; flex: none; border-radius: 50%; overflow: hidden; background: var(--pm-color-accent-soft); color: var(--pm-color-accent); font-weight: 600; }
  .ui-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
`
