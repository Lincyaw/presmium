// The key poses of every action and each action's timing: which pose shows for how many ticks. Coordinates are
// drawing units (the ground at y 40, the cat facing right); a limb is a list of joints from where it leaves the body
// to the paw. Key poses are held, breakdowns between them flash by, and every action loops back to where it began.
import { GROUND, type Joint, type Point, type Pose } from './draw.ts'

const G = GROUND - 0.6        // where a paw's centre sits on the ground
const TAU = Math.PI * 2

const leg = (root: Point, knee: Point, paw: Point, r: Point | [number, number, number] = [2.3, 1.8, 1.65]): Joint[] =>
  [[root[0], root[1], r[0]], [knee[0], knee[1], r[1]], [paw[0], paw[1], r[2] ?? 1.65]]

/** A tail from `base`: its first joint points `start` degrees and each next one turns `curl` more; `wave` swings
 * it, the swing reaching each joint a little later toward the tip. */
function tail(base: Point, start: number, curl: number, { n = 7, seg = 2.6, r0 = 1.7, r1 = 0.95, wave = 0, phase = 0 } = {}): Joint[] {
  const pts: Point[] = [base]
  for (let i = 0; i < n; i++) {
    const a = (start + curl * i + wave * (0.3 + 0.7 * i / n) * Math.sin(phase - 0.8 * i)) * Math.PI / 180
    const [x, y] = pts[pts.length - 1]!
    pts.push([x + seg * Math.cos(a), y + seg * Math.sin(a)])
  }
  return pts.map(([x, y], i) => [x, y, r0 + (r1 - r0) * i / n])
}

const clone = <T>(v: T): T => structuredClone(v)
const pose = (base: Pose, changes: Partial<Pose>): Pose => ({ ...clone(base), ...changes })

function shift(P: Pose, dx: number, dy: number): Pose {
  const mv = (j: Joint): Joint => [j[0] + dx, j[1] + dy, j[2]]
  const Q = clone(P)
  Q.body = Q.body.map(mv); Q.head = mv(Q.head)
  if (Q.tail) Q.tail = Q.tail.map(mv)
  Q.legs = (Q.legs ?? []).map(l => l.map(mv)); Q.limbs = (Q.limbs ?? []).map(l => l.map(mv))
  for (const key of ['balls', 'z', 'hearts'] as const) if (Q[key]) Q[key] = Q[key]!.map(mv)
  if (Q.dots) Q.dots = mv(Q.dots)
  return Q
}

/** A breakdown between two poses with the same parts: numbers in proportion, the rest switching halfway. */
function mix<T>(a: T, b: T, k: number): T {
  if (typeof a === 'number' && typeof b === 'number') return (a + (b - a) * k) as T
  if (Array.isArray(a) && Array.isArray(b)) return (a.length === b.length ? a.map((x, i) => mix(x, b[i], k)) : k < 0.5 ? a : b) as T
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    return Object.fromEntries([...keys].map(key => {
      const x = (a as Record<string, unknown>)[key], y = (b as Record<string, unknown>)[key]
      return [key, x !== undefined && y !== undefined ? mix(x, y, k) : (k < 0.5 ? x : y)]
    })) as T
  }
  return k < 0.5 ? a : b
}

// ---- standing ----
const STAND: Pose = {
  body: [[19, 30, 5.6], [26, 30.5, 5.2], [32, 29.5, 5.8]], head: [38, 21.5, 7],
  legs: [leg([23, 32], [23.6, 36], [24, G]), leg([35, 32], [35.6, 36], [36, G]),
    leg([20.5, 32], [20.6, 36], [21, G], [2.5, 1.9, 1.7]), leg([32.5, 32], [32.6, 36], [33, G])],
  tail: tail([14.5, 28], -160, 22),
}
const standTail = (phase: number, amp = 14) => tail([14.5, 28], -160, 22, { wave: amp, phase })
/** Breathing in: the chest and rump a little fuller, the head a touch higher. */
const breathe = (P: Pose, k: number): Pose => {
  const Q = clone(P)
  Q.body = Q.body.map(([x, y, r]) => [x, y - 0.15 * k, r + 0.18 * k])
  Q.head = [Q.head[0], Q.head[1] - 0.25 * k, Q.head[2]]
  return Q
}
const IDLE = [0, 1, 2, 3, 4, 5].map(i => breathe(pose(STAND, { tail: standTail(i * TAU / 6) }), Math.sin(i * TAU / 6) * 0.5 + 0.5))

// ---- walking: eight poses from a four-beat gait (hind then fore on each side) ----
function walkPose(k: number, n = 8): Pose {
  const home = { hf: 24, ff: 36, hn: 21, fn: 33 }
  const offs = { hn: 0, fn: 0.25, hf: 0.5, ff: 0.75 }
  const bob = 0.5 * Math.sin(4 * Math.PI * k / n)
  const paws = {} as Record<keyof typeof home, Point>
  for (const name of Object.keys(home) as (keyof typeof home)[]) {
    const p = (k / n + offs[name]) % 1
    if (p < 0.6) paws[name] = [home[name] + 3.6 - 7.2 * p / 0.6, G]
    else {
      const q = (p - 0.6) / 0.4
      paws[name] = [home[name] - 3.6 + 7.2 * (3 * q * q - 2 * q ** 3), G - 2.6 * Math.sin(Math.PI * q)]
    }
  }
  const roots = { hf: [23, 32 + bob], ff: [35, 32 + bob], hn: [20.5, 32 + bob], fn: [32.5, 32 + bob] } as Record<keyof typeof home, Point>
  const L = (name: keyof typeof home, r: [number, number, number] = [2.3, 1.8, 1.65]) => {
    const [rx, ry] = roots[name], [px, py] = paws[name]
    return leg([rx, ry], [(rx + px) / 2 + (name[0] === 'h' ? -1.2 : 0.8), (ry + py) / 2], [px, py], r)
  }
  const P = shift(STAND, 0, bob)
  P.head = [P.head[0], P.head[1] + 0.35 * Math.sin(4 * Math.PI * k / n + 1), P.head[2]]
  P.legs = [L('hf'), L('ff'), L('hn', [2.5, 1.9, 1.7]), L('fn')]
  P.tail = tail([14.5, 28 + bob], -150, 20, { wave: 12, phase: TAU * k / n })
  return P
}
const WALK = Array.from({ length: 8 }, (_, k) => walkPose(k))

// ---- running: five drawn key poses of a gallop ----
const RUN: Pose[] = [
  { // gathered: all four paws under a round, arched body
    body: [[24, 29.5, 5.8], [29, 27.5, 5.4], [34, 29.5, 5.6]], head: [40, 24, 7], foldL: 0.3, foldR: 0.3,
    legs: [leg([26, 31], [30, 34], [33, 38]), leg([35, 31], [32, 35], [29.5, 37.5]),
      leg([25, 31], [29, 35], [31, 38.8], [2.5, 1.9, 1.7]), leg([33.5, 31], [30, 35.5], [27, 38.8])],
    tail: tail([19, 27], -135, 14),
  },
  { // push: the hind legs drive back, the forelegs reach up and forward
    body: [[19, 30, 5.6], [26.5, 28, 5.2], [34, 26.5, 5.6]], head: [40.5, 19.5, 7], foldL: 0.3, foldR: 0.3,
    legs: [leg([22, 32], [18.5, 36], [15.5, 39.2]), leg([36, 28.5], [41, 30.5], [45.5, 28.5]),
      leg([20.5, 32], [17, 36], [13.5, G], [2.5, 1.9, 1.7]), leg([35, 28.5], [40, 31.5], [44.5, 30.5])],
    tail: tail([14, 28], -168, 7),
  },
  { // flight: stretched long, legs flung fore and aft
    body: [[15.5, 28, 5.3], [26, 27, 5], [36.5, 27, 5.5]], head: [43, 21.5, 7], foldL: 0.4, foldR: 0.4,
    legs: [leg([18, 30], [12.5, 32], [7.5, 32.5]), leg([38, 29.5], [45, 31], [51, 30]),
      leg([16.5, 30], [11, 32.5], [5.5, 34], [2.5, 1.9, 1.7]), leg([37, 30], [44, 32.5], [50, 32.5])],
    tail: tail([10.5, 26.5], 178, -2), lines: [[[0, 22], [6, 22]], [[-2, 27], [3, 27]]],
  },
  { // landing: the forepaws strike, the hind legs swing forward
    body: [[18, 27.5, 5.4], [26, 28.5, 5.2], [34, 30.5, 5.8]], head: [40.5, 24.5, 7], foldL: 0.3, foldR: 0.3,
    legs: [leg([20, 29.5], [18.5, 33], [21.5, 35.5]), leg([36, 32.5], [40, 36], [42, G]),
      leg([19, 29.5], [17, 33.5], [19.5, 36.5], [2.5, 1.9, 1.7]), leg([35, 32.5], [38, 36], [39.5, G])],
    tail: tail([13, 26], -172, 6),
  },
  { // gathering: the forelegs push back as the hind legs come under
    body: [[22, 29, 5.6], [28, 28.5, 5.4], [34, 30, 5.8]], head: [40, 24.5, 7], foldL: 0.3, foldR: 0.3,
    legs: [leg([24, 31], [26.5, 35], [28.5, 37.5]), leg([35, 32], [33, 36], [31, G]),
      leg([23, 31], [25, 35], [26, 38.3], [2.5, 1.9, 1.7]), leg([34, 32], [31, 36], [28.5, G])],
    tail: tail([17, 27], -150, 11),
  },
]

// ---- sitting ----
const SIT: Pose = {
  body: [[24, 33.5, 6.6], [27, 28.5, 5.2], [30, 24.5, 4.8]], head: [33.5, 16.5, 7],
  legs: [leg([32, 27], [33.2, 33], [34, G], [2, 1.7, 1.6]), leg([30, 27], [31, 33], [31.5, G]),
    leg([26, 37], [28.5, 38.5], [31, 39.3], [2.6, 2, 1.7])],
  tail: [[19, 36.5, 1.7], [16.5, 38.6, 1.6], [18, 39.6, 1.5], [22.5, 39.7, 1.4], [27.5, 39.8, 1.25], [32.5, 39.6, 1.1], [35.5, 38.6, 1]],
}
const sitTip = (y: number, x = 36.3): Joint[] => [...SIT.tail!.slice(0, -1), [x, y, 1]]
const SIT_BREATHE = breathe(SIT, 1)

/** A forepaw lifted in front of a sitting cat, reaching `paw`. */
function sitPaw(paw: Point, changes: Partial<Pose> = {}, bend = 2): Pose {
  const P = pose(SIT, changes)
  P.legs = [SIT.legs![0]!, SIT.legs![2]!]
  P.limbs = [leg([30, 26.5], [(30 + paw[0]) / 2 + bend, (26.5 + paw[1]) / 2 + 1], paw, [2.2, 1.8, 1.75])]
  return P
}

// ---- lying ----
const LOAF: Pose = {
  body: [[20, 35, 5], [27, 35, 5], [33, 34.5, 5.2]], head: [38.5, 29, 7], eyes: 'happy',
  legs: [[[34, 38.2, 2], [37.5, 39.2, 1.6]]],
  tail: [[15.5, 37, 1.6], [13.5, 39.3, 1.5], [17, 39.9, 1.4], [22.5, 40, 1.3], [28.5, 40, 1.2], [33, 39.7, 1]],
}
const SLEEP: Pose = {
  body: [[19.5, 36, 4.9], [26.5, 34, 5.6], [32.5, 35.5, 5]], head: [36, 34.5, 6.6], tilt: 18, eyes: 'closed', foldL: 0.2, foldR: 0.2,
  tail: [[15, 37.5, 1.6], [15, 39.5, 1.5], [19.5, 40, 1.4], [25.5, 40, 1.3], [31.5, 40, 1.2], [37.5, 39.6, 1.1], [40.5, 38.6, 1]],
  legs: [],
}

// ---- crouching, leaping, jumping ----
const CROUCH: Pose = {
  body: [[18.5, 33, 5.6], [25, 34, 5], [31.5, 34.5, 5.2]], head: [37.5, 30, 6.8], eyes: 'wide', look: [0.9, 0.2],
  legs: [leg([21, 35.5], [25, 36.5], [22.5, G]), leg([33.5, 37], [36, 38.4], [37.5, G], [2, 1.7, 1.6]),
    leg([19, 35.5], [23.5, 37], [20.5, G], [2.5, 1.9, 1.7]), leg([32, 37], [34.5, 38.6], [35.5, G])],
  tail: tail([13.5, 33], 176, -2),
}
const JUMP_UP: Pose = {
  body: [[24, 27, 5.2], [28, 22.5, 4.8], [32, 18.5, 5.3]], head: [36.5, 11, 6.8], tilt: -14, eyes: 'wide', look: [0.4, -0.7],
  legs: [leg([24, 29.5], [23, 34.5], [22.5, G - 1]), leg([34, 18], [37.5, 14.5], [39.5, 11], [2, 1.7, 1.6]),
    leg([23, 30], [22, 35], [21, G - 0.5], [2.5, 1.9, 1.7]), leg([33, 19], [36, 15.5], [38.5, 12.5])],
  tail: tail([20, 29], 120, 8),
}
const TUCKED = pose(STAND, {
  eyes: 'happy', tail: tail([14.5, 28], -175, 14),
  legs: [leg([23, 32], [25, 34.5], [24, 36.5]), leg([35, 32], [36.5, 34.5], [35, 36.5]),
    leg([20.5, 32], [22.5, 35], [21.5, 37], [2.5, 1.9, 1.7]), leg([32.5, 32], [34, 35], [32.5, 37])],
})
const FALLING = pose(STAND, {
  eyes: 'wide', foldL: 0.3, foldR: 0.3, tail: tail([14.5, 28], -120, 6),
  legs: [leg([23, 32], [22.5, 36], [23.5, 40]), leg([35, 32], [37, 36], [38, 40]),
    leg([20.5, 32], [20, 36.5], [20.5, 40.5], [2.5, 1.9, 1.7]), leg([32.5, 32], [34.5, 36.5], [35.5, 40.5])],
})

// ---- stretching ----
const STRETCH_FRONT: Pose = {
  body: [[18.5, 26, 5.4], [25, 30, 5], [31.5, 33.5, 4.8]], head: [38.5, 31, 6.8], tilt: -10, eyes: 'closed', mouth: 'yawn', foldL: 0.3, foldR: 0.3,
  legs: [leg([21, 28], [21.6, 33.5], [22, G]), leg([34, 35.5], [41, 38], [47.5, G - 0.2], [2, 1.7, 1.6]),
    leg([18.5, 28.5], [19, 34], [19.5, G], [2.5, 1.9, 1.7]), leg([33, 36], [39, 38.5], [45, G])],
  tail: tail([13.5, 23], -112, 6),
}
const STRETCH_BACK: Pose = {
  body: [[20.5, 31, 5.4], [27, 29.5, 5.1], [33, 27.5, 5.7]], head: [39, 20, 7], eyes: 'half',
  legs: [leg([23, 33], [23.5, 36.5], [24, G]), leg([35, 30], [35.6, 35], [36, G]),
    leg([20, 33], [15, 36], [10.5, 38.8], [2.5, 1.9, 1.7]), leg([32.5, 30], [32.6, 35], [33, G])],
  tail: tail([15.5, 29], -172, 6),
}

// ---- frightened ----
const ARCH: Pose = {
  body: [[20.5, 25.5, 5], [27, 21, 5.2], [33.5, 25, 5.2]], head: [39.5, 23.5, 6.8], eyes: 'wide', look: [0.3, 0], mouth: 'open', foldL: 0.75, foldR: 0.75,
  legs: [leg([22.5, 28.5], [22.8, 34], [23, G], [2.1, 1.7, 1.6]), leg([33.5, 28.5], [33.7, 34], [34, G], [2, 1.7, 1.6]),
    leg([21, 28.5], [21, 34], [21, G], [2.3, 1.8, 1.7]), leg([32, 28.5], [32, 34], [32, G])],
  tail: tail([16.5, 22.5], -96, 3, { r0: 2.9, r1: 2.1, seg: 2.4 }),
}

function scratch(foot: Point, changes: Partial<Pose> = {}): Pose {
  const P = pose(SIT, { tilt: 16, eyes: 'closed', head: [33.5, 17, 7], ...changes })
  P.legs = SIT.legs!.slice(0, 2)
  P.limbs = [leg([25.5, 35], [31, 30.5], foot, [2.6, 1.9, 1.7])]
  return P
}

function side(reach: number, eyes: Pose['eyes'] = 'happy'): Pose {
  return {
    body: [[18.5, 36, 4.8], [26, 35.6, 5.2], [33, 36, 4.9]], head: [39.5, 33.5, 6.6], tilt: 24, eyes, foldL: 0.15,
    legs: [leg([33, 37.5], [38 + reach, 38], [43 + 2 * reach, 38.6], [2, 1.7, 1.6]), leg([34, 36.5], [39.5 + reach, 36.2], [45 + 2 * reach, 36.6], [2, 1.7, 1.6]),
      leg([19.5, 37.5], [14 - reach, 38.2], [9 - 2 * reach, 38.8], [2.4, 1.9, 1.7]), leg([20.5, 36.5], [15 - reach, 36.2], [10 - 2 * reach, 36.4], [2.2, 1.8, 1.6])],
    tail: [[14, 34.5, 1.6], [11, 32.5, 1.5], [8, 32, 1.35], [5, 33, 1.2], [3, 35, 1]],
  }
}

/** Blinking: the lids come down, shut, and lift again. */
const blinkOf = (P: Pose): Pose[] => [pose(P, { lid: 0.5 }), pose(P, { eyes: 'closed' }), pose(P, { lid: 0.4 })]

export interface Action {
  poses: Pose[]
  /** [pose, ticks, units moved forward over those ticks] */
  timeline: [number, number, number?][]
}

/** Builds an action from a list of steps, each a pose (or a pose index already in the list) with its ticks. */
function act(steps: [Pose, number, number?][]): Action {
  const poses: Pose[] = [], timeline: [number, number, number?][] = []
  for (const [P, ticks, move] of steps) {
    let i = poses.indexOf(P)
    if (i < 0) { poses.push(P); i = poses.length - 1 }
    timeline.push(move ? [i, ticks, move] : [i, ticks])
  }
  return { poses, timeline }
}

export const TICK_MS = 80

const idleBlink = blinkOf(IDLE[0]!)
const idleEar = [pose(IDLE[2]!, { foldR: 0.6 }), pose(IDLE[2]!, { foldR: 0.25 })]
const idleLook = [pose(IDLE[3]!, { tilt: -6, look: [0, -0.6] }), pose(IDLE[3]!, { tilt: -9, look: [-0.4, -0.7] })]

const sitBlink = blinkOf(SIT)
const sitEar = [pose(SIT, { foldL: 0.6 }), pose(SIT, { foldL: 0.25 })]
const SIT_TIPS = [pose(SIT, { tail: sitTip(37.4, 36.4) }), pose(SIT, { tail: sitTip(36, 36.2) }), pose(SIT, { tail: [...SIT.tail!.slice(0, -2), [34.5, 38.2, 1.1], [36.6, 35, 1]] })]

const MEOW_UP = pose(SIT, { head: [33.8, 15.6, 7], tilt: -8, mouth: 'tongue', eyes: 'happy' })
const MEOW_OPEN = pose(SIT, { head: [34, 15, 7], tilt: -13, mouth: 'open', eyes: 'happy', foldL: 0.25, foldR: 0.25 })

const LICK_DOWN = sitPaw([38, 22.5], { head: [33.5, 17.5, 7], tilt: 14, mouth: 'tongue', eyes: 'happy' })
const LICK_UP = sitPaw([38, 21.5], { head: [33.5, 16.6, 7], tilt: 6, eyes: 'happy' })
const WASH_A = sitPaw([37.5, 13.5], { head: [33.5, 17, 7], tilt: 22, eyes: 'closed' })
const WASH_B = sitPaw([35.5, 10.5], { head: [33.5, 17.5, 7], tilt: 26, eyes: 'closed' })
const PAW_REACH = sitPaw([33, 30], { eyes: 'happy' }, 1)

const STRETCH_MID = pose(mix(STAND, STRETCH_FRONT, 0.5), { eyes: 'half', mouth: undefined })
const STRETCH_DEEP = pose(mix(STAND, STRETCH_FRONT, 0.82), { eyes: 'closed', mouth: undefined })
const STRETCH_BACK_MID = mix(STAND, STRETCH_BACK, 0.5)

const LOAF_IN = pose(LOAF, { body: [[20, 34.8, 5.2], [27, 34.7, 5.25], [33, 34.3, 5.4]] })
const LOAF_TIP = pose(LOAF, { tail: [...LOAF.tail!.slice(0, -1), [34, 37, 1]] })

const KNEAD_BASE = pose(LOAF, { body: [[20, 35, 5], [27, 34, 5], [33, 32, 5.4]], head: [38.5, 25.5, 7], eyes: 'happy' })
const KNEAD_A = pose(KNEAD_BASE, { legs: [leg([34, 34], [36, 37], [38, G], [2, 1.7, 1.6]), leg([35, 34], [38, 35], [40.5, 36.5], [2, 1.7, 1.6])], hearts: [[45, 15, 1.4]] })
const KNEAD_B = pose(KNEAD_BASE, { legs: [leg([34, 34], [37, 35.5], [39.5, 36.5], [2, 1.7, 1.6]), leg([35, 34], [37.5, 37], [40, G], [2, 1.7, 1.6])], hearts: [[46, 12.5, 1.1]] })

const SLEEP_IN = pose(SLEEP, { body: [[19.5, 35.7, 5.1], [26.5, 33.6, 5.9], [32.5, 35.3, 5.2]] })
const sleepZ = (P: Pose, k: number): Pose => pose(P, { z: [[42 + 2 * k, 26 - 6 * k, 2 + 1.2 * k]] })

const play = (paw: Point, ball: Joint, changes: Partial<Pose> = {}) => sitPaw(paw, { eyes: 'wide', look: [0.8, 0.6], tilt: 6, balls: [ball], ...changes }, 1)
const PLAY_WATCH = play([31.5, G], [44, 38.4, 1.8], { look: [0.9, 0.9] })
const PLAY_WIND = play([36, 26.5], [44, 38.4, 1.8])
const PLAY_UP = play([38.5, 25], [44, 38.4, 1.8])
const PLAY_HIT = play([42, 35.5], [44.5, 38.4, 1.8], { eyes: 'happy' })
const PLAY_ROLL = play([40.5, 37.5], [51, 38.4, 1.8])
const PLAY_BACK = play([36, 39], [47, 38.4, 1.8], { look: [0.9, 0.7] })

const CROUCH_L = pose(CROUCH, { body: [[17.4, 32.4, 5.6], ...CROUCH.body.slice(1)], tail: tail([12.4, 32.4], 176, -2, { wave: 25, phase: 1 }) })
const CROUCH_R = pose(CROUCH, { body: [[19.6, 32.4, 5.6], ...CROUCH.body.slice(1)], tail: tail([14.6, 32.4], 176, -2, { wave: 25, phase: 4 }) })
const LAUNCH = pose(shift(RUN[1]!, 0, -1), { eyes: 'wide' })
const LEAP = pose(shift(RUN[2]!, 0, -6), { eyes: 'wide' })
const LANDING = RUN[3]!
const SETTLE = mix(CROUCH, STAND, 0.5)

const JUMP_TOP = shift(TUCKED, 0, -12), JUMP_RISE = shift(mix(JUMP_UP, TUCKED, 0.5), 0, -6), JUMP_FALL = shift(FALLING, 0, -5)
const JUMP_LOAD = mix(STAND, CROUCH, 0.55)

const ARCH_B = shift(pose(ARCH, { tail: tail([16.5, 22.5], -100, 4, { r0: 3, r1: 2.2, seg: 2.4 }) }), 0.4, 0)

const SCRATCH_A = scratch([29.5, 14]), SCRATCH_B = scratch([30.5, 16.5]), SCRATCH_END = scratch([29, 13], { tilt: 18, eyes: 'happy' })

const LOUNGE = [side(0), side(1.2), side(2.2, 'closed')]

const CURIOUS = [pose(SIT, { tilt: -16, eyes: 'wide', look: [0.2, -0.6], foldR: 0.1 }), pose(SIT, { eyes: 'wide', look: [0.5, -0.3] }),
  pose(SIT, { tilt: 16, eyes: 'wide', look: [0.7, -0.4], foldL: 0.1 }), pose(SIT, { tilt: -8, eyes: 'wide', look: [0.3, -0.5] }), pose(SIT, { tilt: 8, eyes: 'wide', look: [0.6, -0.5] })]

// ---- for the assistant: thinking, reading, writing, asking, done ----
const THINK = pose(SIT, { tilt: -10, look: [-0.5, -0.9], lid: 0.2 })
const thinkWith = (dots: number, extra: Partial<Pose> = {}) => pose(THINK, { dots: [41, 7, dots], ...extra })
const READ = pose(LOAF, { head: [38.5, 29.6, 7], tilt: 8, eyes: 'open', lid: 0.3 })
const reading = (x: number, extra: Partial<Pose> = {}) => pose(READ, { look: [x, 0.7], ...extra })
const tap = (up: boolean) => sitPaw(up ? [37.5, 31.5] : [38.5, 37.5], { eyes: 'open', lid: 0.25, look: [0.8, 0.8], tilt: 8 }, up ? 1 : 0)
const BECKON_UP = sitPaw([36.5, 20], { eyes: 'open', look: [0.2, 0], tilt: -6, mouth: 'tongue' }, 2)
const BECKON_DOWN = sitPaw([38, 24.5], { eyes: 'open', look: [0.2, 0], tilt: -4 }, 2)
const DONE_HOP = shift(pose(SIT, { eyes: 'happy', hearts: [[44, 5, 1.3]], tail: [...SIT.tail!.slice(0, -2), [34.5, 37.6, 1.1], [36.4, 34.6, 1]] }), 0, -5)
const DONE_LOAD = pose(shift(SIT, 0, 0.8), { head: [33.5, 17.8, 7], eyes: 'happy' })

export const ACTIONS: Record<string, Action> = {
  idle: act([[IDLE[0]!, 3], [IDLE[1]!, 3], [IDLE[2]!, 3], [IDLE[3]!, 3], [IDLE[4]!, 3], [IDLE[5]!, 3], [IDLE[0]!, 2],
    [idleBlink[0]!, 1], [idleBlink[1]!, 1], [idleBlink[2]!, 1], [IDLE[1]!, 3], [IDLE[2]!, 2], [idleEar[0]!, 1], [idleEar[1]!, 1], [IDLE[2]!, 2],
    [IDLE[3]!, 3], [IDLE[4]!, 3], [idleLook[0]!, 2], [idleLook[1]!, 10], [idleLook[0]!, 2], [IDLE[5]!, 3]]),
  walk: act(WALK.map(P => [P, 2, 1.9] as [Pose, number, number])),
  run: act(RUN.map(P => [P, 1, 3.2] as [Pose, number, number])),
  sit: act([[SIT, 8], [SIT_BREATHE, 5], [SIT, 3], [SIT_TIPS[0]!, 1], [SIT_TIPS[1]!, 2], [SIT_TIPS[2]!, 3], [SIT_TIPS[1]!, 2], [SIT_TIPS[0]!, 1],
    [SIT, 5], [sitBlink[0]!, 1], [sitBlink[1]!, 1], [sitBlink[2]!, 1], [SIT_BREATHE, 5], [SIT, 4], [sitEar[0]!, 1], [sitEar[1]!, 1], [SIT, 5]]),
  curious: act([[CURIOUS[1]!, 4], [CURIOUS[3]!, 1], [CURIOUS[0]!, 10], [CURIOUS[3]!, 1], [CURIOUS[1]!, 3], [CURIOUS[4]!, 1], [CURIOUS[2]!, 10], [CURIOUS[4]!, 1], [CURIOUS[1]!, 5]]),
  meow: act([[SIT, 8], [MEOW_UP, 1], [MEOW_OPEN, 6], [MEOW_UP, 2], [SIT, 10]]),
  groom: act([[SIT, 3], [PAW_REACH, 1], [LICK_UP, 2], [LICK_DOWN, 2], [LICK_UP, 2], [LICK_DOWN, 2], [LICK_UP, 2], [LICK_DOWN, 2],
    [WASH_A, 2], [WASH_B, 3], [WASH_A, 2], [WASH_B, 3], [LICK_UP, 2], [PAW_REACH, 1], [SIT, 4]]),
  stretch: act([[STAND, 6], [STRETCH_MID, 2], [STRETCH_DEEP, 2], [STRETCH_FRONT, 14], [STRETCH_DEEP, 2], [STRETCH_MID, 2], [STAND, 3],
    [STRETCH_BACK_MID, 2], [STRETCH_BACK, 12], [STRETCH_BACK_MID, 2], [STAND, 8]]),
  loaf: act([[LOAF, 6], [LOAF_IN, 6], [LOAF, 6], [LOAF_TIP, 2], [LOAF, 2], [LOAF_IN, 6], [pose(LOAF, { eyes: 'closed' }), 3], [LOAF, 6]]),
  knead: act([[KNEAD_A, 3], [KNEAD_B, 3]]),
  sleep: act([[sleepZ(SLEEP, 0), 6], [sleepZ(SLEEP_IN, 0.5), 6], [sleepZ(SLEEP_IN, 1), 6], [sleepZ(SLEEP, 1.4), 6]]),
  play: act([[PLAY_WATCH, 8], [PLAY_WIND, 2], [PLAY_UP, 2], [PLAY_HIT, 2], [PLAY_ROLL, 6], [PLAY_BACK, 6]]),
  pounce: act([[CROUCH, 6], [CROUCH_L, 2], [CROUCH_R, 2], [CROUCH_L, 2], [CROUCH_R, 2], [CROUCH_L, 1], [CROUCH_R, 1], [CROUCH, 2],
    [LAUNCH, 2, 3], [LEAP, 3, 6], [LANDING, 2, 3], [CROUCH, 3, 0.8], [SETTLE, 2], [STAND, 8]]),
  jump: act([[STAND, 6], [JUMP_LOAD, 2], [CROUCH, 3], [JUMP_UP, 2], [JUMP_RISE, 1], [JUMP_TOP, 4], [JUMP_FALL, 2], [CROUCH, 3], [SETTLE, 2], [STAND, 6]]),
  scared: act([[ARCH, 1], [ARCH_B, 1]]),
  scratch: act([[SIT, 6], [SCRATCH_A, 1], [SCRATCH_B, 1], [SCRATCH_A, 1], [SCRATCH_B, 1], [SCRATCH_A, 1], [SCRATCH_B, 1], [SCRATCH_A, 1], [SCRATCH_B, 1], [SCRATCH_END, 6], [SIT, 6]]),
  lounge: act([[LOUNGE[0]!, 8], [LOUNGE[1]!, 2], [LOUNGE[2]!, 10], [LOUNGE[1]!, 2], [LOUNGE[0]!, 8]]),
  // the assistant's states
  think: act([[THINK, 4], [thinkWith(1), 4], [thinkWith(2), 4], [thinkWith(3), 6], [thinkWith(3, { tilt: -12, look: [-0.2, -0.9] }), 4],
    [thinkWith(3, { eyes: 'closed' }), 1], [thinkWith(0), 3]]),
  read: act([[reading(-0.7), 4], [reading(-0.2), 3], [reading(0.3), 3], [reading(0.8), 4], [reading(0.8, { lid: 0.5 }), 1], [reading(-0.7), 3],
    [reading(-0.2), 3], [reading(0.3), 3], [reading(0.8), 3], [reading(0.8, { tail: LOAF_TIP.tail }), 3]]),
  write: act([[tap(true), 2], [tap(false), 2], [tap(true), 2], [tap(false), 3], [pose(tap(true), { lid: 0.5 }), 1], [tap(false), 2]]),
  ask: act([[SIT, 4], [BECKON_DOWN, 2], [BECKON_UP, 3], [BECKON_DOWN, 2], [BECKON_UP, 3], [BECKON_DOWN, 2], [MEOW_UP, 1], [MEOW_OPEN, 4], [SIT, 6]]),
  done: act([[SIT, 3], [DONE_LOAD, 2], [DONE_HOP, 4], [DONE_LOAD, 2], [pose(SIT, { eyes: 'happy' }), 10], [SIT, 6]]),
}
