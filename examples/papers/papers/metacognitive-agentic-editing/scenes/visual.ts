import type { SceneContext } from '@lincyaw/addon-motion/scene'
import type { gsap } from 'gsap'
import { brand, clock, escape, frame, LAYER } from '../../../kit/frame.ts'
export { clock, escape }
export type Ctx=SceneContext & {gsap:typeof gsap}
export interface Shot{id:string;title:string;labels:string[];source:string;values?:number[];lines?:string[];details?:string[]}
export const C={blue:'#4c78a8',red:'#e07b54',green:'#2b8a78',ink:'var(--pm-color-ink)',muted:'var(--pm-color-muted)',surface:'var(--pm-color-surface)',line:'var(--pm-color-line-strong)',sunk:'var(--pm-color-sunk)'}
export const tx=(t:string,x:number,y:number,size=3,fill=C.ink,anchor='start',cls='')=>'<text class="'+cls+'" x="'+x+'" y="'+y+'" text-anchor="'+anchor+'" font-size="'+size+'" font-weight="650" style="fill:'+fill+'">'+escape(t)+'</text>'
export const box=(x:number,y:number,w:number,h:number,cls='',stroke=C.line,fill=C.surface)=>'<rect class="'+cls+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="1.2" fill="'+fill+'" stroke="'+stroke+'" stroke-width=".3"/>'
export const link=(x:number,y:number,x2:number,y2:number,cls='',stroke=C.blue)=>'<path class="'+cls+'" d="M'+x+','+y+' C'+(x+x2)/2+','+y+' '+(x+x2)/2+','+y2+' '+x2+','+y2+'" stroke="'+stroke+'" stroke-width=".5" fill="none"/>'
export const svg=(s:string)=>'<svg class="layer" '+LAYER+'>'+s+'</svg>'
export function mount(ctx:Ctx,shots:Shot[],art:string,css=''){
 frame(ctx.root,'.heading{position:absolute;left:5cqw;top:10cqh;font-size:3cqw;font-weight:800}.src{position:absolute;left:5cqw;top:70.5cqh;font-size:1.15cqw;color:var(--pm-color-muted)}'+css,brand('MBT-A')+shots.map((s,i)=>'<div class="heading h'+i+'">'+escape(s.title)+'</div><div class="src src'+i+'">'+escape(s.source)+'</div>').join('')+art)
}
export function start(ctx:Ctx,tl:ReturnType<typeof gsap.timeline>,shots:Shot[]){ const{T}=clock(ctx.at,ctx.durations);ctx.gsap.set('.heading,.src',{autoAlpha:0});ctx.gsap.set('.h0,.src0',{autoAlpha:1});shots.slice(1).forEach((_,i)=>{tl.set('.h'+i+',.src'+i,{autoAlpha:0},T(i+1,.004));tl.set('.h'+(i+1)+',.src'+(i+1),{autoAlpha:1},T(i+1,.004))});return T}
export function wipe(ctx:Ctx,tl:ReturnType<typeof gsap.timeline>,s:string,t:number,d=.65){ctx.root.querySelectorAll<SVGGeometryElement>(s).forEach(el=>{const l=el.getTotalLength();ctx.gsap.set(el,{strokeDasharray:l,strokeDashoffset:l});tl.to(el,{strokeDashoffset:0,duration:d,ease:'power2.inOut'},t)})}
export function finish(ctx:Ctx,tl:ReturnType<typeof gsap.timeline>){tl.set({}, {},ctx.total/1000);return tl}
