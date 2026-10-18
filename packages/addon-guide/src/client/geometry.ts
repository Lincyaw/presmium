export interface Point {
  x: number
  y: number
}

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
