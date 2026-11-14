import {gsapScene} from '@lincyaw/addon-motion/scene'
import {C,clock,tx,box,edge,mount,headers,finish} from './visual.ts'
import type {Shot} from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!.labels,{T}=clock(ctx.at,ctx.durations),{gsap}=ctx
 const body=box(61,20,38,15,'candidate',C.green)+tx(a[0]!,80,29,3.1,C.green,'candidate')+
 edge('M70,35 L40,48','routes',C.muted)+edge('M90,35 L120,48','routes',C.muted)+
 edge('M17,52 H62','ruler-a',C.orange)+edge('M98,52 H143','ruler-b',C.red)+
 tx(a[1]!,40,62,3.1,C.orange,'reward')+tx(a[2]!,120,62,3.1,C.red,'utility')+
 '<circle class="dot-a" cx="70" cy="35" r="1.7" fill="'+C.orange+'"/><circle class="dot-b" cx="90" cy="35" r="1.7" fill="'+C.red+'"/>'+
 tx(a[3]!,80,69,2.7,C.muted,'condition')
 mount(ctx,shots,body)
 const tl=gsap.timeline();headers(ctx,tl,shots,T)
 gsap.set('.routes,.ruler-a,.ruler-b,.reward,.utility,.dot-a,.dot-b,.condition',{autoAlpha:0})
 tl.to('.routes,.ruler-a,.ruler-b,.reward,.utility',{autoAlpha:1,duration:.35,stagger:.08},T(0,.18))
 tl.to('.dot-a,.dot-b',{autoAlpha:1,duration:.01},T(0,.46));tl.to('.dot-a',{attr:{cx:49,cy:52},duration:1,ease:'power3.inOut'},T(0,.46));tl.to('.dot-b',{attr:{cx:111,cy:52},duration:1,ease:'power3.inOut'},T(0,.46))
 tl.to('.condition',{autoAlpha:1,duration:.35},T(0,.72))
 return finish(ctx,tl)
})
