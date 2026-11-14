import type { SceneContext } from '@lincyaw/addon-motion/scene'
import type { gsap } from 'gsap'
import { brand, clock, escape, frame, LAYER, TYPE } from '../../../kit/frame.ts'
export { clock, escape, TYPE }
export interface Shot { id: string; kind: string; title: string; labels: string[]; values?: number[]; mode?: string; figure?: string; source: string; details?: string[]; example?: { question: string; lines: string[]; answer: string }; rollouts?: { correct: boolean; method: number }[]; series?: { name: string; color: string; values: number[] }[] }
export type Context = SceneContext & { gsap: typeof gsap }
export type Timeline = ReturnType<typeof gsap.timeline>
export type Beat = (k: number, f?: number) => number
export const C = { blue: '#4e79a7', orange: '#f28e2b', pink: '#cc78a8', green: '#009e73', ink: 'var(--pm-color-ink)', muted: 'var(--pm-color-muted)', line: 'var(--pm-color-line-strong)', surface: 'var(--pm-color-surface)', sunk: 'var(--pm-color-sunk)' }
export const svg = (body: string) => '<svg class="layer" ' + LAYER + '>' + body + '</svg>'
export const tx = (t: string, x: number, y: number, size = 3.0, fill = C.ink, anchor = 'middle', cls = '') =>
  '<text class="' + cls + '" x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" font-size="' + size + '" font-weight="650" style="fill:' + fill + '">' + escape(t) + '</text>'
export const rect = (x: number, y: number, w: number, h: number, color = C.surface, cls = '', stroke = C.line) =>
  '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="1.2" fill="' + color + '" stroke="' + stroke + '" stroke-width="0.28"/>'
export const path = (x: number, y: number, x2: number, y2: number, color = C.line, cls = '') =>
  '<path class="' + cls + '" d="M' + x + ',' + y + ' C' + (x+x2)/2 + ',' + y + ' ' + (x+x2)/2 + ',' + y2 + ' ' + x2 + ',' + y2 + '" fill="none" stroke="' + color + '" stroke-width="0.48"/>'
export const trace = (x: number, y: number, color = C.orange, cls = '') =>
  '<g class="' + cls + '">' + rect(x,y,8,13,C.surface,'',color) + '<path d="M' + (x+1.6) + ',' + (y+3) + ' h4.8 m-4.8,3 h4 m-4,3 h4.8" stroke="' + color + '" stroke-width="0.5" fill="none"/></g>'
export function mount(root: HTMLElement, shots: Shot[], body: string, css = '') {
  frame(root, `
    .shot-title{position:absolute;left:5cqw;top:10.5cqh;right:4cqw;font-size:2.85cqw;font-weight:800;line-height:1.2}
    .shot-source{position:absolute;left:5cqw;top:75cqh;right:4cqw;font-size:1.1cqw;color:var(--pm-color-muted);white-space:nowrap}
    .metric{font-variant-numeric:tabular-nums}
    ${css}
  `, brand('SFT Data') + shots.map((s,i)=>'<div class="shot-title title-'+i+'">'+escape(s.title)+'</div><div class="shot-source source-'+i+'">'+escape(s.source)+'</div>').join('') + body)
}
export function headings(ctx: Context, tl: Timeline, shots: Shot[], T: Beat) {
  ctx.gsap.set('.shot-title,.shot-source',{autoAlpha:0})
  ctx.gsap.set('.title-0,.source-0',{autoAlpha:1})
  shots.slice(1).forEach((_,i)=>{
    tl.set('.title-'+i+',.source-'+i,{autoAlpha:0},T(i+1))
    tl.set('.title-'+(i+1)+',.source-'+(i+1),{autoAlpha:1},T(i+1))
  })
}
export function draw(ctx: Context, tl: Timeline, selector: string, start: number, duration = .7) {
  ctx.root.querySelectorAll<SVGGeometryElement>(selector).forEach(el=>{
    const n=el.getTotalLength()
    ctx.gsap.set(el,{strokeDasharray:n,strokeDashoffset:n})
    tl.to(el,{strokeDashoffset:0,duration,ease:'power2.inOut'},start)
  })
}
export function finish(ctx: Context, tl: Timeline) { tl.set({}, {}, ctx.total/1000); return tl }
