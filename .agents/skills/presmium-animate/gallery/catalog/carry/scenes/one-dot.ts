import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, markSvg, pick } from '../../../lengths/scenes/kit/frame.ts'
import { anchored, camera, float, lattice, matrixCss, mul, project, view, type Cam, type CamKey } from '../../../lengths/scenes/kit/fx/camera.ts'
import { uid } from '../../../lengths/scenes/kit/fx/ids.ts'
import { hop, impact, iris, letterDrop, maskRise, morphRect, popIn, press, ribbon, seal, wordRise, type Matrix } from '../../../lengths/scenes/kit/fx/moves.ts'
import { clamp01, ease, mix, phase, shake } from '../../../lengths/scenes/kit/fx/time.ts'

// One dot becomes each next thing Presmium makes, in one continuous world under one operated camera: the dot lands;
// it opens into the document (morphRect); the document's steps are hit three times on an elastic rail (ribbon, the
// burst); the last step's bullet opens the slide (iris); the camera pulls back to show the slide is a video frame
// and the slide's key node hops onto the timeline as the playhead (camera + hop); the play button grows into a
// turning seal that is the end card (seal), where the name drops in letter by letter. States, one per beat:
// dot 1.2 · doc 2.2 · steps 1.5 · slide 2.2 · video 2.5 · title 5.4 s. Every hold is dead still: the camera's
// float is zero there and every shake has ended.

const W = 1920, H = 1080
const PAGE = { x: 700, y: 190, w: 520, h: 700, r: 22 }
const DOT = { x: 920, y: 500, w: 80, h: 80, r: 40 }
const PITCH = 560                                     // rail: one step panel to the next
const BLOCK = (k: number) => 100 + k * 195            // top of block k, page units
const Z3 = 1.42                                       // the camera's zoom after the three hits
// The slide level: drawn in its own 1920×1080 units, filling the frame at zoom Z3 around the page's centre.
const N: Matrix = [1 / Z3, 0, 0, 1 / Z3, 960 - 960 / Z3, 540 - 540 / Z3]
const toWorld = (x: number, y: number) => ({ x: 960 + (x - 960) / Z3, y: 540 + (y - 540) / Z3 })
const NODE = { x: 960, y: 470 }, HEAD = { x: 560, y: 1210 }, PLAY = { x: 80, y: 1210 }

// Beat times, seconds (the state boundaries are 1.2, 3.4, 4.9, 7.1, 9.6).
const T = {
  land: 0.5, morph: [1.25, 1.95], lines: 1.8,
  hits: [3.55, 3.95, 4.35], iris: [4.95, 5.55], slideIn: 5.1,
  pull: [7.15, 7.95], hop: [8.0, 8.5], fill: 8.5,
  whip: [9.65, 10.25], seal: [9.7, 10.55], mark: 10.3, name: 10.5, tag: 11.15,
}
const SWITCHES = [T.hits[1]!, T.hits[2]!]
const HITS: [number, number, number][] = [[T.land, 16, 0.5], [T.hits[0]!, 9, 0.4], [T.hits[1]!, 11, 0.4], [T.hits[2]!, 13, 0.45], [T.hop[1]!, 12, 0.5]]

// The camera, keyed where each beat needs it: on the dot, following the morph out, a stepped push on each hit,
// still under the iris, a pull back to the player, a whip onto the play button that leaves it high in the frame.
const vid = toWorld(960, 640), endCam = anchored(toWorld(PLAY.x, PLAY.y), { x: 960, y: 430, zoom: Z3 })
const KEYS: CamKey[] = [
  { t: 0, x: 960, y: 540, zoom: 2.4 },
  { t: T.morph[0]!, x: 960, y: 540, zoom: 2.4 },
  { t: T.morph[1]! + 0.05, x: 960, y: 540, zoom: 1, curve: ease.inOutSine },
  ...T.hits.flatMap((h, i) => [{ t: h - 0.04, zoom: 1 + 0.14 * i }, { t: h + 0.14, zoom: 1.14 + 0.14 * i, curve: ease.out3 }]),
  { t: T.pull[0]!, x: 960, y: 540, zoom: Z3 },
  { t: T.pull[1]!, x: vid.x, y: vid.y, zoom: Z3 * 0.7, curve: ease.inOut3 },
  { t: T.whip[0]!, x: vid.x, y: vid.y, zoom: Z3 * 0.7 },
  { t: T.whip[1]!, x: endCam.x, y: endCam.y, zoom: Z3, curve: ease.inOutExpo },
]
const MOVES = [T.morph, T.iris, [T.pull[0]!, T.hop[0]!], T.whip]
/** The hand's envelope: 1 inside the camera's moves, 0 in every hold. */
const handEnv = (t: number) => Math.max(...MOVES.map(([a, b]) => Math.sin(Math.PI * clamp01((t - a!) / (b! - a!)))))

function camAt(t: number): Cam {
  const c = camera(t, KEYS)
  const [fx, fy] = float(t, 4, handEnv(t), c.zoom)
  let x = c.x + fx, y = c.y + fy
  for (const [th, amp, dur] of HITS) {
    const [dx, dy] = shake(t - th, amp, dur, Math.round(th * 100))
    x += dx / c.zoom; y += dy / c.zoom
  }
  return { ...c, x, y }
}

const f = (v: number) => +v.toFixed(2)
const set = (el: Element, attrs: Record<string, string | number>) => { for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(typeof v === 'number' ? f(v) : v)) }
const snap = (k: number) => (Math.abs(1 - k) < 1e-3 ? 1 : k)

function panelSvg(j: number, cls: string): string {
  const blocks = [0, 1, 2].map(k => {
    const y = BLOCK(k), hot = k === j
    return `<g class="blk blk-${k}${hot ? ' hot' : ''}">
      <rect class="blk__bg" x="28" y="${y}" width="464" height="175" rx="16" />
      <g class="blk__in">
        <circle class="blk__dot" cx="56" cy="${y + 33}" r="10" />
        <rect class="bar" x="80" y="${y + 23}" width="220" height="20" rx="10" />
        <rect class="ln" x="56" y="${y + 70}" width="380" height="12" rx="6" />
        <rect class="ln" x="56" y="${y + 100}" width="340" height="12" rx="6" />
        <rect class="ln" x="56" y="${y + 130}" width="250" height="12" rx="6" />
      </g></g>`
  }).join('')
  return `<g class="${cls}"><text class="mono" x="36" y="66">lecture.json</text>
    <text class="chip" x="484" y="66" text-anchor="end">步骤 ${j + 1}</text>${blocks}</g>`
}

export default defineScene(ctx => {
  const clip = uid('od-clip'), pat = uid('od-lat'), irisId = uid('od-iris')
  const el = frame(ctx.root, `
    .stage { position: absolute; inset: 0; width: 100%; height: 100%; display: block; background: var(--pm-color-bg); }
    .lat circle { fill: var(--pm-color-line-strong); }
    .page { fill: var(--pm-color-surface); stroke: var(--pm-color-line-strong); stroke-width: 3; }
    .dot { fill: var(--pm-color-accent); }
    .mono { font: 500 26px var(--pm-font-mono); fill: var(--pm-color-muted); }
    .chip { font: 600 26px var(--pm-font-sans); fill: var(--pm-color-accent); }
    .blk__bg { fill: transparent; }
    .hot .blk__bg { fill: var(--pm-color-accent-soft); stroke: var(--pm-color-accent-line); stroke-width: 2; }
    .blk__dot { fill: var(--pm-color-line-strong); }
    .hot .blk__dot { fill: var(--pm-color-accent); }
    .bar { fill: var(--pm-color-muted); opacity: 0.55; }
    .ln { fill: var(--pm-color-line-strong); }
    .slide-bg { fill: var(--pm-color-surface); }
    .player { fill: var(--pm-color-sunk); stroke: var(--pm-color-line-strong); stroke-width: 4; }
    .s-title { font: 600 104px var(--pm-font-serif); fill: var(--pm-color-ink); }
    .edge { stroke: var(--pm-color-line-strong); stroke-width: 6; }
    .node { fill: var(--pm-color-surface); stroke: var(--pm-color-ink); stroke-width: 6; }
    .socket { fill: none; stroke: var(--pm-color-line-strong); stroke-width: 4; stroke-dasharray: 10 10; }
    .track { fill: var(--pm-color-line-strong); }
    .progress, .head, .play { fill: var(--pm-color-accent); }
    .tri { fill: var(--pm-color-on-accent); }
    .ring { fill: none; stroke: var(--pm-color-on-accent); stroke-width: 5; stroke-dasharray: 3 22; stroke-linecap: round; opacity: 0.55; }
    .rim { fill: none; stroke: var(--pm-color-accent); stroke-width: 5; }
    .end { position: absolute; inset: 0; color: var(--pm-color-on-accent); pointer-events: none; }
    .end .mark { position: absolute; left: 50%; top: 39.8%; width: 10.5cqw; height: 10.5cqw; margin: -5.25cqw 0 0 -5.25cqw; }
    .name { position: absolute; left: 0; right: 0; top: 64%; display: flex; justify-content: center; font: 600 7cqw/1 var(--pm-font-serif); letter-spacing: -0.01em; }
    .name span { display: inline-block; transform-origin: 50% 100%; }
    .tag { position: absolute; left: 0; right: 0; top: 79%; text-align: center; font-size: 2.6cqw; font-weight: 500; }
  `, `<svg class="stage" viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <defs>
        <pattern id="${pat}" class="lat" patternUnits="userSpaceOnUse" width="48" height="48"><circle cx="24" cy="24" r="1.4" /></pattern>
        <clipPath id="${clip}"><rect x="0" y="0" width="${PAGE.w}" height="${PAGE.h}" rx="${PAGE.r}" /></clipPath>
        <clipPath id="${irisId}" clipPathUnits="userSpaceOnUse"><circle class="iris-c" cx="0" cy="0" r="0" /></clipPath>
      </defs>
      <rect class="lat-fill" x="0" y="0" width="${W}" height="${H}" fill="url(#${pat})" opacity="0.7" />
      <g class="world">
        <g class="pg">
          <rect class="page" x="0" y="0" width="${PAGE.w}" height="${PAGE.h}" rx="${PAGE.r}" />
          <g clip-path="url(#${clip})"><g class="rail">${[0, 1, 2].map(j => panelSvg(j, `pn pn-${j}`)).join('')}</g></g>
          <rect class="dot morph-dot" x="0" y="0" width="${PAGE.w}" height="${PAGE.h}" rx="${PAGE.r}" />
        </g>
      </g>
      <g class="iris-wrap" clip-path="url(#${irisId})">
        <g class="lvl">
          <rect class="player" x="-70" y="-70" width="2060" height="1380" rx="44" />
          <rect class="slide-bg" x="0" y="0" width="1920" height="1080" />
          <g class="slide-in">
            <text class="s-title" x="150" y="230">注意力</text>
            <line class="edge" x1="${NODE.x}" y1="${NODE.y}" x2="620" y2="760" />
            <line class="edge" x1="${NODE.x}" y1="${NODE.y}" x2="1300" y2="760" />
            <line class="edge" x1="620" y1="760" x2="1300" y2="760" />
            <circle class="node" cx="620" cy="760" r="40" /><circle class="node" cx="1300" cy="760" r="40" />
            <circle class="socket" cx="${NODE.x}" cy="${NODE.y}" r="36" />
          </g>
          <g class="trk"><rect class="track" x="160" y="1205" width="1700" height="10" rx="5" /><rect class="progress" x="160" y="1205" width="0" height="10" rx="5" /></g>
          <circle class="head" cx="${NODE.x}" cy="${NODE.y}" r="40" />
          <circle class="seal play" cx="${PLAY.x}" cy="${PLAY.y}" r="44" />
          <circle class="ring" cx="${PLAY.x}" cy="${PLAY.y}" r="0" />
          <path class="tri" d="M -12 -18 L 20 0 L -12 18 Z" />
        </g>
      </g>
      <circle class="rim" cx="0" cy="0" r="0" />
    </svg>
    <div class="end">${markSvg('mark')}<div class="name">${[...'Presmium'].map(c => `<span>${c}</span>`).join('')}</div><div class="tag">一份文稿，四种形态</div></div>`)

  const q = <E extends Element = SVGElement>(s: string) => pick<E>(el, s)
  const latFill = q('.lat-fill'), latPat = q(`#${pat}`), latDot = q(`#${pat} circle`)
  const world = q('.world'), pg = q('.pg'), page = q('.page'), mdot = q('.morph-dot'), rail = q('.rail')
  const panels = [0, 1, 2].map(j => q(`.pn-${j}`))
  const p0 = panels[0]!, p0chip = pick(p0, '.chip'), p0hot = pick(p0, '.blk-0'), p0blocks = [0, 1, 2].map(k => pick(p0, `.blk-${k} .blk__in`))
  const p0header = pick(p0, '.mono')
  const irisWrap = q('.iris-wrap'), irisC = q('.iris-c'), rim = q('.rim'), lvl = q('.lvl'), slideIn = q('.slide-in')
  const head = q('.head'), progress = q('.progress'), sealEl = q('.seal'), ring = q('.ring'), tri = q('.tri')
  const end = pick<HTMLElement>(el, '.end'), mark = pick<HTMLElement>(end, '.mark'), tag = pick<HTMLElement>(end, '.tag')
  const letters = [...end.querySelectorAll<HTMLElement>('.name span')]
  set(pg, { transform: `translate(${PAGE.x} ${PAGE.y})` })

  return (ms: number) => {
    const t = ms / 1000
    const cam = camAt(t), V = view(cam)

    // A far lattice to slide against: one pattern, dots a constant size on screen.
    const L = lattice(cam, { depth: 1.2, spacing: 48, px: 1.6 })
    set(latPat, { patternTransform: matrixCss(L.matrix) }); set(latDot, { r: L.r })
    set(world, { transform: matrixCss(V) })

    // dot → doc: the dot falls and lands, then one rect becomes the page.
    const fall = ease.in2(phase(t, T.land - 0.35, 0.35)), hit = impact(t, T.land)
    const m = morphRect(t, T.morph[0]!, T.morph[1]!, DOT, { x: PAGE.x, y: PAGE.y, w: PAGE.w, h: PAGE.h, r: PAGE.r }, { curve: ease.inOut3 })
    const pre = t < T.morph[0]!
    const dy = pre ? (1 - fall) * -160 : 0
    const sx = pre ? hit.sx : 1, sy = pre ? hit.sy : 1
    const g = { x: m.x - PAGE.x, y: m.y - PAGE.y + dy }
    set(mdot, { x: g.x + (m.w * (1 - sx)) / 2, y: g.y + m.h * (1 - sy), width: m.w * sx, height: m.h * sy, rx: m.r })
    mdot.setAttribute('opacity', String(f(1 - ease.out2(clamp01((m.k - 0.35) / 0.5)))))
    mdot.setAttribute('visibility', t >= T.land - 0.36 ? 'visible' : 'hidden')
    const opened = m.k > 0.001
    set(page, { x: m.x - PAGE.x, y: m.y - PAGE.y, width: m.w, height: m.h, rx: m.r })
    page.setAttribute('visibility', opened ? 'visible' : 'hidden')
    rail.setAttribute('visibility', opened ? 'visible' : 'hidden')

    // The page's lines rise from behind their blocks, one after another.
    p0blocks.forEach((b, k) => {
      const r = maskRise(t, T.lines, k, { dist: 40 })
      b.setAttribute('transform', `translate(0 ${f(snap(r.k) === 1 ? 0 : r.y)})`)
      b.setAttribute('opacity', String(f(clamp01(r.k * 1.6))))
    })
    p0header.setAttribute('opacity', String(f(clamp01((t - T.lines + 0.1) / 0.25))))

    // steps: three hits. The first lights step 1 in place; the next two switch the rail, which rings and lags.
    const pr = press(t, T.hits[0]!, { depth: 0.05 })
    p0hot.classList.toggle('hot', pr.down)
    p0chip.setAttribute('visibility', pr.down ? 'visible' : 'hidden')
    p0hot.setAttribute('transform', pr.down ? `translate(260 ${BLOCK(0) + 87}) scale(${f(snap(pr.s) * 1000) / 1000}) translate(-260 ${-BLOCK(0) - 87})` : '')
    const rb = ribbon(t, SWITCHES, { dur: 0.18, amp: 26, decay: 9, omega: 24, tilt: 0.02, stretchX: 0.06, stretchY: 0.04 })
    panels.forEach((p, j) => p.setAttribute('transform', `translate(${f((j - rb.shift) * PITCH + rb.textDx * 0.4)} 0)`))
    const wob = Math.abs(rb.wobble) < 0.05 ? 0 : rb.wobble
    pg.setAttribute('transform', `translate(${f(PAGE.x + wob)} ${PAGE.y}) translate(260 350) rotate(${f(wob * 0.04)}) scale(${f(rb.sx * 1000) / 1000} ${f(rb.sy * 1000) / 1000}) translate(-260 -350)`)

    // slide: the last step's bullet opens the slide (an iris in screen space, centred on the bullet).
    const VL = mul(V, N)
    const [bx, by] = project(V, PAGE.x + 56, PAGE.y + BLOCK(2) + 33)
    const ir = iris(t, T.iris[0]!, T.iris[1]!, bx, by, { curve: ease.inOut2, r0: 10 })
    const shown = t >= T.iris[0]!
    irisWrap.setAttribute('visibility', shown ? 'visible' : 'hidden')
    set(irisC, { cx: bx, cy: by, r: ir.covered ? 4000 : ir.r })
    set(rim, { cx: bx, cy: by, r: ir.r })
    rim.setAttribute('opacity', String(f(ir.k > 0 && ir.k < 1 ? Math.min(1, ir.k * 6, (1 - ir.k) * 4) : 0)))
    set(lvl, { transform: matrixCss(VL) })
    const pi = popIn(t, T.slideIn, { rise: 40, s0: 0.96 })
    const ps = snap(pi.k) === 1 ? 1 : pi.s
    slideIn.setAttribute('transform', `translate(960 ${f(540 + (snap(pi.k) === 1 ? 0 : pi.dy))}) scale(${f(ps * 1000) / 1000}) translate(-960 -540)`)
    slideIn.setAttribute('opacity', String(f(pi.op)))

    // video: the camera has pulled back to the player; the key node hops onto the timeline and lands as the playhead.
    const hp = hop(t, T.hop[0]!, T.hop[1]!, NODE, HEAD, { height: 300 })
    const land = impact(t, T.hop[1]!, { sqx: 0.25, sqy: 0.3 })
    const hr = mix(40, 24, ease.inOut2(phase(t, T.hop[0]!, 0.5)))
    const landed = t >= T.hop[1]!
    head.setAttribute('transform', `translate(${f(hp.x)} ${f(hp.y)}) scale(${landed ? f(land.sx) : 1} ${landed ? f(land.sy) : 1}) translate(${-NODE.x} ${-NODE.y})`)
    set(head, { r: hr })
    head.setAttribute('opacity', String(f(pi.op)))
    const fill = ease.outExpo(phase(t, T.fill, 0.3))
    set(progress, { width: (HEAD.x - 160) * fill })

    // title: the play button grows into a turning seal that floods the frame; the mark and the name land on it.
    const s = seal(t, T.seal[0]!, T.seal[1]!, { r: 1, turns: 0.5 })
    const R = mix(44, 1250, s.k)
    set(sealEl, { r: R })
    const deg = (s.rot * 180) / Math.PI
    set(ring, { r: mix(0, 180, s.k), transform: `rotate(${f(deg)} ${PLAY.x} ${PLAY.y})` })
    tri.setAttribute('transform', `translate(${PLAY.x + 4} ${PLAY.y}) rotate(${f(deg)}) scale(${f(1 - ease.out2(clamp01(s.k * 1.6)))})`)
    const pm = popIn(t, T.mark, { rise: 0, s0: 0.8 })
    end.style.visibility = t >= T.mark ? 'visible' : 'hidden'
    mark.style.opacity = String(f(pm.op))
    mark.style.transform = `scale(${snap(pm.k) === 1 ? 1 : f(pm.s * 1000) / 1000})`
    letters.forEach((sp, i) => {
      const d = letterDrop(t, T.name, i, { dist: 3 })
      const done = snap(d.k) === 1 && d.sx - 1 < 1e-3
      sp.style.opacity = String(f(d.op))
      sp.style.transform = done ? 'none' : `translateY(${f(d.y)}cqw) scale(${f(d.sx * 1000) / 1000}, ${f(d.sy * 1000) / 1000})`
    })
    const w = wordRise(t, T.tag, { dist: 1 })
    tag.style.opacity = String(f(w.op * 0.85))
    tag.style.transform = snap(w.k) === 1 ? 'none' : `translateY(${f(w.y)}cqw)`
  }
})
