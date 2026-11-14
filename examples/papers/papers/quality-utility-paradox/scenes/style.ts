import {gsapScene} from '@lincyaw/addon-motion/scene'
import original from '../figures/style-training.png'
import {C,clock,tx,box,edge,mount,headers,finish} from './visual.ts'
import type {Shot} from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!.labels,{T}=clock(ctx.at,ctx.durations),{gsap}=ctx
 const body='<svg class="paper-camera" x="5" y="17" width="76" height="50" viewBox="0 0 1600 1455" preserveAspectRatio="xMidYMid meet"><image href="'+original+'" width="1600" height="1455"/><rect class="wash" width="1600" height="1455" fill="#fff" opacity=".5"/></svg>'+
 box(10,24,68,31,'dft-focus',C.green,'none')+
 tx(a[0]!,109,24,2.8,C.muted,'axes')+tx(a[1]!,109,31,2.8,C.muted,'axes')+
 tx(a[2]!,109,43,3.5,C.red,'native')+tx(a[3]!,109,51,3.5,C.green,'aligned')+
 tx(a[4]!,109,61,5.1,C.green,'peak')+tx(a[5]!,109,68,2.4,C.muted,'peak')+
 '<circle class="point" cx="73.8" cy="27.0" r="2" fill="none" stroke="'+C.green+'" stroke-width=".6"/>'
 mount(ctx,shots,body)
 const tl=gsap.timeline();headers(ctx,tl,shots,T)
 gsap.set('.axes,.native,.aligned,.peak,.point,.dft-focus',{autoAlpha:0})
 tl.to('.axes',{autoAlpha:1,duration:.3},T(0,.15));tl.to('.wash',{opacity:0,duration:.4},T(0,.30))
 tl.to('.native',{autoAlpha:1,duration:.35},T(0,.35));tl.to('.paper-camera',{attr:{viewBox:'0 0 1600 760'},duration:1.1,ease:'power3.inOut'},T(0,.37));tl.to('.dft-focus',{autoAlpha:1,duration:.3},T(0,.42))
 tl.to('.aligned',{autoAlpha:1,duration:.35},T(0,.55));tl.to('.point',{autoAlpha:1,duration:.3},T(0,.66));tl.to('.point',{attr:{r:3.4},duration:.65},T(0,.66));tl.to('.peak',{autoAlpha:1,duration:.3},T(0,.78))
 return finish(ctx,tl)
})
