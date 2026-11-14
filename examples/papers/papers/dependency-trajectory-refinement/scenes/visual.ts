import type { SceneContext } from '@lincyaw/addon-motion/scene'
import type { gsap } from 'gsap'
import { brand, clock, escape, frame, LAYER } from '../../../kit/frame.ts'
export { clock }
export const C={ink:'var(--pm-color-ink)',muted:'var(--pm-color-muted)',surface:'var(--pm-color-surface)',line:'var(--pm-color-line-strong)',sunk:'var(--pm-color-sunk)',green:'#0e9692',teal:'#0ecdb4',red:'#b22222',orange:'#c97a2c'}
export type Ctx=SceneContext & {gsap:typeof gsap}
export interface Shot{title:string;labels:string[];source:string;values?:number[]}
export const tx=(t:string,x:number,y:number,size=2.8,fill=C.ink,cls='',anchor='middle')=>'<text class="'+cls+'" x="'+x+'" y="'+y+'" text-anchor="'+anchor+'" font-size="'+size+'" font-weight="650" style="fill:'+fill+'">'+escape(t)+'</text>'
export const box=(x:number,y:number,w:number,h:number,cls='',stroke=C.line,fill=C.surface)=>'<rect class="'+cls+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="1.5" fill="'+fill+'" stroke="'+stroke+'" stroke-width=".35"/>'
export const edge=(d:string,cls='',color=C.green,dash=false)=>'<path class="'+cls+'" d="'+d+'" fill="none" stroke="'+color+'" stroke-width=".65"'+(dash?' stroke-dasharray="1.1 1.1"':'')+'/>'
export const node=(x:number,y:number,number:string,label:string,cls='',color=C.green)=>'<g class="'+cls+'">'+box(x-11,y-5,22,10,'',color)+tx(number,x-7,y-1,2.3,color)+tx(label,x,y+3,2.6)+'</g>'
export function mount(ctx:Ctx,shots:Shot[],body:string,css=''){
frame(ctx.root,'.heading{position:absolute;left:5cqw;top:10.5cqh;font-size:2.85cqw;font-weight:800}.source{position:absolute;left:5cqw;top:74cqh;font-size:1.1cqw;color:var(--pm-color-muted)}'+css,brand('Trajectory Refinement')+shots.map((s,i)=>'<div class="heading h'+i+'">'+escape(s.title)+'</div><div class="source src'+i+'">'+escape(s.source)+'</div>').join('')+'<svg class="layer" '+LAYER+'>'+body+'</svg>')
}
export function headers(ctx:Ctx,tl:ReturnType<typeof gsap.timeline>,shots:Shot[],T:(k:number,f?:number)=>number){ctx.gsap.set('.heading,.source',{autoAlpha:0});ctx.gsap.set('.h0,.src0',{autoAlpha:1});shots.slice(1).forEach((_,i)=>{tl.set('.h'+i+',.src'+i,{autoAlpha:0},T(i+1,.004));tl.set('.h'+(i+1)+',.src'+(i+1),{autoAlpha:1},T(i+1,.004))})}
export function draw(ctx:Ctx,tl:ReturnType<typeof gsap.timeline>,sel:string,start:number,duration=.7){ctx.root.querySelectorAll<SVGGeometryElement>(sel).forEach(el=>{const n=el.getTotalLength();ctx.gsap.set(el,{strokeDasharray:n,strokeDashoffset:n});tl.to(el,{strokeDashoffset:0,duration,ease:'power2.inOut'},start)})}
export const finish=(ctx:Ctx,tl:ReturnType<typeof gsap.timeline>)=>{tl.set({}, {},ctx.total/1000);return tl}
