import { threeScene } from '@lincyaw/addon-motion/scene'
import { glowTexture, disposeAll, tone } from '../../../lengths/scenes/kit/three-fx.ts'
import { TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { ease, phase } from '../../../lengths/scenes/kit/fx/time.ts'
import { drawFigure, type Figure } from './lib/figures.ts'
import { decodePictures } from './lib/images.ts'
import { overlay } from './lib/overlay.ts'

// A ring of figure cards in depth that turns to show one figure at a time, with one line saying what to read in it:
// a paper's five figures, the stages of an experiment, before you discuss each. One state per card.
// `enter` (2 s): the cards rise into a ring 70 ms apart while the ring turns half a turn and slows to a stop on the
// first card (0–1.4 s); the first card steps out towards the camera with a 4% overshoot (1.3–1.75 s) and its line
// rises under it (1.5–1.9 s), then holds. Every later state (`card-2` … `card-5`, 1.8 s, the last 2.6 s): the line
// leaves and the card steps back (0–0.22 s), the ring turns one place to the left, so the next figure comes in
// from the right, the reading direction (0.12–0.77 s, both ends eased); the new card steps out as the turn lands
// (0.7–1.1 s) and its line rises (0.75–1.1 s); hold. The cause (the turn) finishes before the effect (the card
// steps out, the line appears), and only one of them moves at a time. During holds the camera drifts by about 1%,
// so a still frame does not look frozen. The cards are canvases drawn from the parameters (a curve, bars, points,
// a number or an SVG picture in tokens), decoded before the first frame; fog in the page colour fades the cards
// at the back, and each card has a soft contact shadow, so the ring reads as objects standing on a stage.
// Adapted from HyperFrames carousel-vision-1 … carousel-vision-5 (and the three-orbiting-cards component).

const ARCHITECTURE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300">
  <g fill="none" stroke="var(--pm-color-line-strong)" stroke-width="5">
    <rect x="12" y="95" width="130" height="110" rx="16" />
    <rect x="235" y="45" width="130" height="210" rx="16" fill="var(--pm-color-accent-soft)" stroke="var(--pm-color-accent)" />
    <rect x="458" y="95" width="130" height="110" rx="16" />
  </g>
  <path d="M142 150 H222 M365 150 H445" stroke="var(--pm-color-ink)" stroke-width="5" />
  <path d="M220 138 L236 150 L220 162 Z M443 138 L459 150 L443 162 Z" fill="var(--pm-color-ink)" />
  <g font-family="sans-serif" font-size="30" text-anchor="middle" fill="var(--pm-color-ink)">
    <text x="77" y="160">输入</text><text x="300" y="160">编码器</text><text x="523" y="160">输出</text>
  </g>
</svg>`

type Card = Figure & { note?: string, picture?: string }

const FIGURES: Card[] = [
  { title: '图 1 · 训练损失', kind: 'line', values: [9, 6.2, 4.6, 3.6, 3.0, 2.6, 2.35, 2.2, 2.1, 2.05, 2.02], note: '两万步后损失趋于平稳', tag: '示意' },
  { title: '图 2 · 模型结构', kind: 'picture', picture: ARCHITECTURE, note: '改动只在中间的编码器' },
  { title: '图 3 · 各方法准确率', kind: 'bars', values: [61, 68, 72, 79], note: '我们的方法最高（右）', tag: '示意' },
  { title: '图 4 · 消融实验', kind: 'bars', values: [79, 71, 76, 77], highlight: 1, note: '去掉注意力，下降最多', tag: '示意' },
  { title: '图 5 · 相对提升', kind: 'number', value: '+12.4%', note: '比最强基线高 12.4 个百分点', tag: '示意' },
]

export default threeScene(async ({ THREE, renderer, root, at, durations, width, height, color, parameters }) => {
  const figures = (parameters.figures as Card[] | undefined) ?? FIGURES
  const pictures = await decodePictures(figures.map(f => f.picture), color)
  const source = (parameters.source as string | undefined) ?? '数据为示意'
  const N = figures.length
  const W = 3.2, H = 2.4
  // The ring is large enough that neighbours stand clear of the card in front.
  const R = Math.max(3.4, (W * 1.45 * N) / (2 * Math.PI))
  const step = (2 * Math.PI) / N

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(new THREE.Color(color('bg')), 10.6, 12 + 2 * R)
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100)

  const ring = new THREE.Group()
  scene.add(ring)
  const plane = new THREE.PlaneGeometry(W, H)
  const shade = glowTexture(THREE)
  const back = new THREE.MeshBasicMaterial({ color: tone(THREE, color, 'sunk'), side: THREE.BackSide, transparent: true })
  const cards = figures.map((figure, i) => {
    const canvas = drawFigure(figure, { color, root }, pictures[i])
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    const face = new THREE.Mesh(plane, new THREE.MeshBasicMaterial({ map, transparent: true }))
    const rear = new THREE.Mesh(plane, back)
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.1, 0.7), new THREE.MeshBasicMaterial({ map: shade, color: tone(THREE, color, 'shadow'), transparent: true, depthWrite: false }))
    shadow.rotation.x = -Math.PI / 2
    shadow.position.y = -H / 2 - 0.08
    const card = new THREE.Group()
    const body = new THREE.Group()
    body.add(face, rear)
    card.add(body, shadow)
    card.position.set(R * Math.sin(i * step), 0, R * Math.cos(i * step))
    ring.add(card)
    return { card, body, face, shadow }
  })

  const layer = overlay(root, `
    .fr-note { position: absolute; left: 0; right: 0; bottom: 7cqh; text-align: center; font-size: ${TYPE.lead}cqw; font-weight: 600; white-space: nowrap; }
    .fr-count { position: absolute; left: 5cqw; bottom: 7.6cqh; font: 500 ${TYPE.label}cqw var(--pm-font-mono); color: var(--pm-color-muted); }
    .fr-source { position: absolute; right: 5cqw; bottom: 7.6cqh; font-size: ${TYPE.caption}cqw; color: var(--pm-color-muted); }
  `, `${figures.map((f, i) => `<div class="fr-note" data-i="${i}">${f.note ?? ''}</div>`).join('')}
    <div class="fr-count"></div><div class="fr-source">${source}</div>`)
  const notes = [...layer.querySelectorAll<HTMLElement>('.fr-note')]
  const count = layer.querySelector<HTMLElement>('.fr-count')!

  const shadowAlpha = 0.22
  return {
    render(ms) {
      // Which card is in front, and how far the move to it has gone.
      let k = 0
      while (k + 1 < durations.length && ms >= at(k + 1)) k += 1
      const t = ms - at(k)
      const focus = Math.min(k, N - 1)
      let turn: number, out: number[], noteIn: number[]
      out = cards.map(() => 0)
      noteIn = cards.map(() => 0)
      if (k === 0) {
        turn = -Math.PI * (1 - ease.out3(phase(t, 0, 1400)))
        cards.forEach((c, i) => {
          const p = ease.outExpo(phase(t, i * 70, 450))
          c.body.position.y = -0.6 * (1 - p)
          for (const m of [c.face.material, back]) m.opacity = p
          ;(c.shadow.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = shadowAlpha * p
        })
        out[0] = ease.backOut(0.6)(phase(t, 1300, 450))
        noteIn[0] = ease.outExpo(phase(t, 1500, 400))
      } else {
        cards.forEach(c => {
          c.body.position.y = 0
          c.face.material.opacity = 1
          ;(c.shadow.material as InstanceType<typeof THREE.MeshBasicMaterial>).opacity = shadowAlpha
        })
        back.opacity = 1
        const prev = focus - 1
        turn = (prev + ease.inOut3(phase(t, 120, 650))) * step
        out[prev] = 1 - ease.in2(phase(t, 0, 220))
        noteIn[prev] = 1 - ease.in2(phase(t, 0, 200))
        out[focus] = ease.backOut(0.6)(phase(t, 700, 400))
        noteIn[focus] = ease.outExpo(phase(t, 750, 350))
      }
      ring.rotation.y = -turn
      cards.forEach((c, i) => {
        // Each card turns 60% of the way back towards the viewer, so the neighbours show their faces, not edges.
        const rel = Math.atan2(Math.sin(i * step - turn), Math.cos(i * step - turn))
        c.card.rotation.y = turn + 0.4 * rel
        c.body.position.z = 0.55 * out[i]!
        c.body.scale.setScalar(1 + 0.06 * out[i]!)
      })
      notes.forEach((el, i) => {
        const v = noteIn[i]!
        el.style.opacity = v.toFixed(3)
        el.style.transform = `translateY(${(1 - v) * 2.4}cqh)`
      })
      count.textContent = `${focus + 1} / ${N}`
      // A slow drift of about 1%, a function of the whole timeline.
      const drift = Math.sin((ms / 1000) * 0.9)
      camera.position.set(0.12 * drift, 1.5, R + 10 - 0.08 * drift)
      camera.lookAt(0, -0.2, R - 1)
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    },
    dispose() {
      disposeAll(scene)
    },
  }
})
