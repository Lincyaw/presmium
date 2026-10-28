// Shared by the scenes of every length: a 16:9 frame whose CSS units are container units (1cqw = 1% of the scene's
// width), so the same piece looks the same in a reading column, on a slide and in a 1280×720 video, and the type
// scale every piece uses. Library-independent: GSAP, Anime.js and Motion scenes all start from it.

/** Type sizes in cqw: a caption is readable in a video, a title fills about a third of the width. */
export const TYPE = { caption: 1.9, body: 2.6, label: 2.2, lead: 3.6, title: 6.2, hero: 9 }

const BASE = `
  .lf { position: absolute; inset: 0; container-type: size; overflow: hidden; font-family: var(--pm-font-sans); color: var(--pm-color-ink); line-height: 1.25; }
  .lf * { box-sizing: border-box; }
  .lf-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2cqh; text-align: center; }
  .lf-title { font: 600 ${TYPE.title}cqw/1.1 var(--pm-font-serif); letter-spacing: -0.01em; white-space: nowrap; }
  .lf-lead { font-size: ${TYPE.lead}cqw; font-weight: 600; white-space: nowrap; }
  .lf-body { font-size: ${TYPE.body}cqw; }
  .lf-caption { font-size: ${TYPE.caption}cqw; color: var(--pm-color-muted); white-space: nowrap; }
  .lf-accent { color: var(--pm-color-accent); }
  .lf-card { border-radius: 1.2cqw; background: var(--pm-color-surface); border: 0.18cqw solid var(--pm-color-line-strong); }
  .lf-chip { display: inline-flex; align-items: center; justify-content: center; padding: 0.6cqw 1.4cqw; border-radius: 99cqw; background: var(--pm-color-accent-soft); color: var(--pm-color-accent); font-size: ${TYPE.label}cqw; font-weight: 600; white-space: nowrap; }
  .lf-mono { font-family: var(--pm-font-mono); }
`

/** Fills `root` with the frame, the piece's own CSS and its markup; returns the frame element. */
export function frame(root: HTMLElement, css: string, html: string): HTMLElement {
  root.innerHTML = `<div class="lf"><style>${BASE}${css}</style>${html}</div>`
  return root.firstElementChild as HTMLElement
}

/** One element of the frame, by selector; a missing element is a mistake in the scene, so it throws. */
export function pick<E extends Element = HTMLElement>(root: ParentNode, selector: string): E {
  const found = root.querySelector<E>(selector)
  if (!found) throw new Error(`no ${selector} in the scene`)
  return found
}

/** The Presmium mark: a page whose corner folds into a play triangle; strokes are drawn, the triangle is filled. */
export function markSvg(className = 'mark'): string {
  return `<svg class="${className}" viewBox="0 0 120 120" aria-hidden="true">
    <path class="${className}__page" d="M 30 14 H 72 L 94 36 V 106 H 30 Z" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round" />
    <path class="${className}__fold" d="M 72 14 V 36 H 94" fill="none" stroke="currentColor" stroke-width="7" stroke-linejoin="round" />
    <path class="${className}__play" d="M 52 52 L 76 67 L 52 82 Z" fill="currentColor" />
  </svg>`
}
