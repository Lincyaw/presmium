/** The film and its companion lesson share this one normalized linear-regression example. */
export const TARGET = 3
export const START = -1
const ROOT_TWO = Math.sqrt(2)

export const DATA: readonly Readonly<{ x: number, y: number }>[] = [-ROOT_TWO, -1 / ROOT_TWO, 0, 1 / ROOT_TWO, ROOT_TWO]
  .map(x => ({ x, y: TARGET * x }))

export const predict = (x: number, w: number) => w * x

/** Half mean squared error; these inputs have mean(x²) = 1, so this is ½(w − 3)². */
export const loss = (w: number) => DATA.reduce((sum, point) => sum + (predict(point.x, w) - point.y) ** 2, 0) / (2 * DATA.length)

/** The derivative of the same loss, computed from the same five observations. */
export const gradient = (w: number) => DATA.reduce((sum, point) => sum + point.x * (predict(point.x, w) - point.y), 0) / DATA.length

export interface ModelStep { iteration: number, w: number, loss: number, gradient: number }

/** `count` is the number of updates; the initial state is retained at iteration zero. */
export function trajectory(alpha: number, count: number, start = START): ModelStep[] {
  const states: ModelStep[] = []
  let w = start
  for (let iteration = 0; iteration <= count; iteration++) {
    states.push({ iteration, w, loss: loss(w), gradient: gradient(w) })
    w -= alpha * gradient(w)
  }
  return states
}
