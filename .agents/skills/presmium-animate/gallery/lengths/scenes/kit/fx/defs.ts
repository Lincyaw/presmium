// SVG <defs> builders for glows, goo, blur and hatching; each takes an id from `uid`, so instances never clash.
// Filters use userSpaceOnUse regions: an objectBoundingBox region of a zero-height line renders nothing.

/** Gooey merge: blur, then an alpha threshold, so shapes that come close melt into one. */
export const gooFilter = (id: string, blur = 10) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%">
  <feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="b" />
  <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" result="goo" />
  <feComposite in="SourceGraphic" in2="goo" operator="atop" />
</filter>`

/** A directional blur (motion blur along x and y), in user units over a region of `w` × `h` from (x, y). */
export const blurFilter = (id: string, bx: number, by = 0, region = { x: -2000, y: -2000, w: 6000, h: 6000 }) =>
  `<filter id="${id}" filterUnits="userSpaceOnUse" x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}"><feGaussianBlur class="${id}__blur" stdDeviation="${bx} ${by}" /></filter>`

/** A glow in `color` behind the shape: a blurred copy merged under the original. */
export const glowFilter = (id: string, color: string, strength = 6, region = { x: -2000, y: -2000, w: 6000, h: 6000 }) =>
  `<filter id="${id}" filterUnits="userSpaceOnUse" x="${region.x}" y="${region.y}" width="${region.w}" height="${region.h}">
  <feGaussianBlur in="SourceAlpha" stdDeviation="${strength}" result="b" />
  <feFlood flood-color="${color}" result="c" /><feComposite in="c" in2="b" operator="in" result="g" />
  <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
</filter>`

/** Diagonal hatching in `color`, `gap` apart. */
export const hatchPattern = (id: string, color: string, gap = 8, width = 2) =>
  `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${gap}" height="${gap}" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="${gap}" stroke="${color}" stroke-width="${width}" /></pattern>`
