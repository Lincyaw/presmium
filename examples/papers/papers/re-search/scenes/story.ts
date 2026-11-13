import { defineScene } from '@lincyaw/addon-motion/scene'
import { brand, escape, frame, LAYER, TYPE } from '../../../kit/frame.ts'
import { MARK } from '../../../kit/brand.ts'
import progress from '../figures/progress.png'
import trees from '../figures/search-trees.png'
import survey from '../figures/naming-gain.png'

// Animatic: deterministic rest frames. All titles, labels, numbers and narration live in lecture.json.
interface Shot {
  id: string
  kind: string
  title: string
  keywords: string[]
  labels?: string[]
  mode?: string
  figure?: string
  values?: number[]
  source: string
}
const figures: Record<string, string> = { progress, trees, survey }
const C = ['var(--pm-color-category-1)', 'var(--pm-color-category-2)', 'var(--pm-color-category-3)', 'var(--pm-color-category-4)']
const line = (x: number, y: number, x2: number, y2: number, color = C[0]!, dash = false) =>
  `<path d="M${x},${y} Q${x},${(y + y2) / 2} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="0.6" ${dash ? 'stroke-dasharray="1 1"' : ''}/>`
const dot = (x: number, y: number, color = C[0]!, r = 1) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`
const label = (text: string, x: number, y: number, anchor = 'middle', color = 'var(--c-ink)') =>
  `<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="2.6" font-weight="650" style="fill:${color}">${escape(text)}</text>`
const wrap = (svg: string) => `<svg class="layer" ${LAYER}>${svg}</svg>`
const ROOT = [51, 63] as const

function tree(s: Shot): string {
  const [rx, ry] = ROOT
  const l = s.labels ?? []
  let out = ''
  if (s.mode === 'deep') {
    const trunk = [[rx, ry], [41, 55], [43, 46], [38, 37], [42, 28]] as const
    trunk.slice(1).forEach((p, i) => {
      const a = trunk[i]!
      out += line(a[0], a[1], p[0], p[1], C[3]) + dot(p[0], p[1], C[3])
      for (let j = 0; j < 4; j++) {
        const x = p[0] + (j - 1.5) * 5.5, y = p[1] - 6.5
        out += line(p[0], p[1], x, y, C[3]) + dot(x, y, C[3], 0.65)
      }
    })
    out += label(l[1] ?? '', 73, 46, 'start', C[3]) + label(l[2] ?? '', 63, 28, 'start') + label(l[3] ?? '', 17, 38, 'start')
  } else if (s.mode === 'wide') {
    for (let i = 0; i < 12; i++) {
      const a = Math.PI * (1.08 + i / 11 * 0.84)
      const x = rx + Math.cos(a) * 38, y = ry + Math.sin(a) * 30
      out += line(rx, ry, x, y, C[1]) + dot(x, y, C[1])
      if (i % 3 === 0) out += line(x, y, x + 3, y - 4, C[1]) + dot(x + 3, y - 4, C[1], 0.65)
    }
    out += label(l[1] ?? '', 22, 25) + label(l[2] ?? '', 78, 27) + label(l[3] ?? '', 55, 22)
  } else {
    const branches = [
      [[rx, ry], [28, 52], [20, 44]],
      [[rx, ry], [51, 51], [56, 41], [70, 32], [80, 23]],
      [[rx, ry], [79, 55], [91, 46]],
    ]
    branches.forEach((path, b) => {
      const c = C[b]!
      path.slice(1).forEach((p, i) => {
        const a = path[i]!
        out += line(a[0]!, a[1]!, p[0]!, p[1]!, c) + dot(p[0]!, p[1]!, c)
        if (i > 0 && b === 1) out += line(a[0]!, a[1]!, a[0]! - 7, a[1]! - 7, c) + dot(a[0]! - 7, a[1]! - 7, c, 0.7)
      })
    })
    out += line(20, 44, 44, 54, 'var(--c-muted)', true)
    out += `<path d="M18,42 l4,4 m0,-4 l-4,4" stroke="var(--pm-color-danger)" stroke-width="0.8"/>`
    out += label(l[1] ?? '', 83, 35, 'start', C[0]) + label(l[2] ?? '', 17, 36) + label(l[3] ?? '', 92, 28)
  }
  out += dot(rx, ry, 'var(--c-muted)', 2) + label(l[0] ?? '', rx, ry + 7)
  return wrap(out)
}
function game(s: Shot): string {
  const l = s.labels ?? []
  let out = line(23, 45, 55, 45) + line(55, 45, 90, 45, C[1])
  out += dot(23, 45, C[0], 8) + dot(55, 45, C[0], 8) + dot(90, 45, C[1], 8)
  out += label(l[0] ?? '', 23, 62) + label(l[1] ?? '', 55, 62) + label(l[3] ?? '', 90, 62)
  out += label('?', 23, 47) + label('Q', 55, 47) + label('A', 90, 47)
  if (s.id === 'feedback') {
    out += line(90, 34, 55, 34, C[1]) + label(l[2] ?? '', 73, 27)
  } else {
    out += `<rect x="80" y="20" width="20" height="13" rx="2" fill="var(--pm-color-category-2-soft)" stroke="${C[1]}" stroke-width="0.4"/>`
    out += label(l[2] ?? '', 90, 28) + line(90, 33, 90, 36, C[1])
  }
  return wrap(out)
}
function pool(s: Shot): string {
  const l = s.labels ?? []
  let out = ''
  for (let i = 0; i < 4; i++) {
    const y = 25 + i * 12
    out += `<rect x="7" y="${y - 5}" width="28" height="10" rx="2" fill="var(--pm-color-category-${i + 1}-soft)" stroke="${C[i]}" stroke-width="0.4"/>`
    out += label(l[i] ?? '', 21, y + 1) + line(35, y, 59, 44, C[i])
  }
  out += `<rect x="59" y="36" width="27" height="16" rx="3" fill="var(--c-surface)" stroke="var(--c-ink)" stroke-width="0.5"/>`
  out += label(l[4] ?? '', 72.5, 45) + line(86, 44, 99, 44, C[0]) + dot(100, 44, C[0], 3)
  return wrap(out)
}
function bars(s: Shot): string {
  const l = s.labels ?? [], values = s.values ?? []
  let out = ''
  for (let v = 0; v <= 10; v += 2) {
    const y = 57 - v * 4
    out += `<line x1="10" y1="${y}" x2="104" y2="${y}" stroke="var(--c-line)" stroke-width="0.2"/>` + label(String(v), 6, y + 1)
  }
  values.forEach((v, i) => {
    const x = 15 + i * 23, y = 57 - v * 4
    const c = i === 3 ? C[0] : 'var(--c-muted)'
    out += `<rect x="${x}" y="${y}" width="13" height="${v * 4}" rx="0.7" fill="${c}"/>`
    out += label(v.toFixed(2), x + 6.5, y - 2, 'middle', c) + label(l[i] ?? '', x + 6.5, 64)
  })
  return wrap(out)
}
function card(s: Shot): string {
  return `<div class="idea-card">${(s.labels ?? []).map((v, i) => `<div><b>${escape(v)}</b><span class="idea-line" style="width:${[74, 90, 60, 82][i]}%"></span></div>`).join('')}</div>`
}
function scope(s: Shot): string {
  const l = s.labels ?? []
  return wrap(line(25, 43, 53, 43) + line(53, 43, 86, 43) + [25,53,86].map((x, i) =>
    dot(x, 43, C[i], 8) + label(l[i] ?? '', x, 61) + label(String(i + 1), x, 45)).join(''))
}

export default defineScene(ctx => {
  const shots = ctx.parameters.frames as unknown as Shot[]
  const s = shots.find(shot => shot.id === ctx.state) ?? shots[0]!
  let drawn = false
  return () => {
    if (drawn) return
    drawn = true
    let art = ''
    if (s.kind === 'tree') art = tree(s)
    if (s.kind === 'game') art = game(s)
    if (s.kind === 'pool') art = pool(s)
    if (s.kind === 'bars') art = bars(s)
    if (s.kind === 'card') art = card(s)
    if (s.kind === 'scope') art = scope(s)
    if (s.kind === 'figure') art = `<div class="paper-figure figure--${s.figure}"><img src="${figures[s.figure!]}" alt="${escape(s.title)}"></div>`
    if (s.kind === 'opening' || s.kind === 'ending') art = `<div class="mark">${MARK}</div>`
    frame(ctx.root, `
      .heading { position:absolute;left:5cqw;top:12cqh;right:4cqw;font-size:${TYPE.title}cqw;font-weight:800;line-height:1.2; }
      .keys { position:absolute;left:70cqw;top:30cqh;width:26cqw;display:flex;flex-direction:column;gap:4cqh; }
      .key { font-size:${TYPE.body}cqw;font-weight:650;line-height:1.5;padding-left:1.3cqw;border-left:0.28cqw solid var(--pm-color-category-1); }
      .key:first-child { font-size:${TYPE.lead}cqw;color:var(--pm-color-category-1); }
      .source { position:absolute;left:5cqw;top:74cqh;width:91cqw;font-size:${TYPE.tiny}cqw;color:var(--c-muted); }
      .paper-figure { position:absolute;left:5cqw;top:25cqh;width:61cqw;height:45cqh;display:flex;align-items:center;justify-content:center; }
      .paper-figure img { width:100%;height:100%;object-fit:contain;border-radius:0.8cqw; }
      .figure--progress { width:54cqw;left:8cqw; }
      .figure--survey { width:49cqw;left:10cqw; }
      .idea-card { position:absolute;left:13cqw;top:26cqh;width:43cqw;padding:3cqw;border:0.2cqw solid var(--c-line-strong);border-radius:1.3cqw;background:var(--c-surface); }
      .idea-card>div { display:flex;align-items:center;gap:2cqw;margin:2cqh 0;font-size:${TYPE.label}cqw; }
      .idea-card b { width:8cqw;white-space:nowrap; }
      .idea-line { display:block;height:0.65cqw;border-radius:1cqw;background:var(--pm-color-category-1-soft); }
      .mark { position:absolute;left:15cqw;top:28cqh;width:27cqw;height:27cqw;border-radius:4cqw;overflow:hidden; }
      .mark svg { width:100%;height:100%; }
    `, `${brand('Re-Search')}<div class="heading">${escape(s.title)}</div>${art}<div class="keys">${s.keywords.map(t => `<div class="key">${escape(t)}</div>`).join('')}</div><div class="source">${escape(s.source)}</div>`)
  }
})
