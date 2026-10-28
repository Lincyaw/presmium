// Value noise from the stateless hash: smooth, seeded, in [-1, 1].
import { hash } from './random.ts'

const fade = (t: number) => t * t * (3 - 2 * t)

export function noise1(seed: number, x: number): number {
  const i = Math.floor(x), f = x - i
  const a = hash(seed, i) * 2 - 1, b = hash(seed, i + 1) * 2 - 1
  return a + (b - a) * fade(f)
}

export function noise2(seed: number, x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y), fx = fade(x - i), fy = fade(y - j)
  const v = (di: number, dj: number) => hash(seed, i + di, j + dj) * 2 - 1
  const top = v(0, 0) + (v(1, 0) - v(0, 0)) * fx
  const bottom = v(0, 1) + (v(1, 1) - v(0, 1)) * fx
  return top + (bottom - top) * fy
}
