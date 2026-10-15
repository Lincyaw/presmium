export interface Point {
  x: number
  y: number
}

/**
 * Centre of `target` in the coordinates of `frame`, the offset parent of an
 * absolutely positioned element. The slides form scales the slide with a CSS
 * transform; dividing by that scale gives untransformed CSS pixels, which do
 * not change when the window is resized. Undefined while `frame` is not laid
 * out (a hidden slide).
 */
export function centerIn(target: Element, frame: HTMLElement): Point | undefined {
  const box = frame.getBoundingClientRect()
  if (!frame.offsetWidth || !box.width) return undefined
  const scale = box.width / frame.offsetWidth
  const rect = target.getBoundingClientRect()
  return {
    x: (rect.left + rect.width / 2 - box.left) / scale - frame.clientLeft + frame.scrollLeft,
    y: (rect.top + rect.height / 2 - box.top) / scale - frame.clientTop + frame.scrollTop,
  }
}
