// Seeded randomness: the same seed gives the same "random" picture on every build, at every seek.

/** A generator of numbers in [0, 1) from a 32-bit seed (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A number in [0, 1) that depends only on its inputs: per-frame flicker is `hash(i, Math.floor(ms / 50))`. */
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export const range = (rng: () => number, a: number, b: number) => a + (b - a) * rng()
export const pick = <T>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!

/** 0..n-1 in a seeded shuffled order: `ranks[i]` is item i's turn, for a "random" stagger that never changes. */
export function ranks(n: number, seed: number): number[] {
  const rng = mulberry32(seed)
  const order = Array.from({ length: n }, (_, i) => i)
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  const turn = new Array<number>(n)
  order.forEach((item, k) => { turn[item] = k })
  return turn
}
