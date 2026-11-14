import {gsapScene} from '@lincyaw/addon-motion/scene'
import original from '../figures/pareto.png'
import {C,clock,tx,box,edge,mount,headers,draw,finish} from './visual.ts'
import type {Shot} from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!.labels,b=shots[1]!.labels,{T}=clock(ctx.at,ctx.durations),{gsap}=ctx
 const body='<image href="'+original+'" x="5" y="19" width="83" height="48.01"/><rect class="wash" x="5" y="19" width="83" height="48.01" fill="#fff" opacity=".58"/>'+
 box(16,57,68,9,'x-axis',C.green,'none')+box(5,20,12,38,'y-axis',C.green,'none')+
 '<circle class="focus" cx="51.6" cy="32.7" r="4.2" fill="none" stroke="'+C.orange+'" stroke-width=".65"/>'+
 edge('M51.6,32.7 V24.2 H37.6','lift',C.green)+edge('M51.6,35 H29.4','saving',C.green)+
 tx(a[0]!,123,25,2.7,C.muted,'baseline')+tx(a[1]!,123,32,6.6,C.ink,'baseline')+
 tx(a[2]!,123,44,2.7,C.green,'l1')+tx(a[3]!,123,53,6.6,C.green,'l1')+tx(a[4]!,123,64,2.7,C.green,'l1')+
 tx(b[0]!,123,24,2.7,C.green,'l2a')+tx(b[1]!,123,32,4.7,C.green,'l2a')+
 tx(b[2]!,123,44,2.8,C.muted,'tokens')+tx(b[3]!,123,52,4.9,C.ink,'tokens')+tx(b[4]!,123,63,3.5,C.green,'saving-label')
 mount(ctx,shots,body)
 const tl=gsap.timeline();headers(ctx,tl,shots,T)
 gsap.set('.x-axis,.y-axis,.focus,.baseline,.l1,.lift,.saving,.l2a,.tokens,.saving-label',{autoAlpha:0})
 tl.to('.x-axis',{autoAlpha:1,duration:.25},T(0,.1));tl.to('.x-axis',{autoAlpha:0,duration:.25},T(0,.23))
 tl.to('.y-axis',{autoAlpha:1,duration:.25},T(0,.23));tl.to('.y-axis',{autoAlpha:0,duration:.25},T(0,.35))
 tl.to('.wash',{opacity:0,duration:.4},T(0,.35));tl.to('.focus,.baseline',{autoAlpha:1,duration:.35},T(0,.35))
 tl.to('.focus',{attr:{cx:37.6,cy:24.2},duration:.8,ease:'power3.inOut'},T(0,.60))
 tl.to('.lift',{autoAlpha:1,duration:.01},T(0,.63));draw(ctx,tl,'.lift',T(0,.63),.7);tl.to('.l1',{autoAlpha:1,duration:.3},T(0,.74))
 tl.to('.l1,.baseline,.lift',{autoAlpha:0,duration:.3},T(1,.08));tl.to('.focus',{attr:{cx:29.4,cy:33.8},duration:.8,ease:'power3.inOut'},T(1,.20))
 tl.to('.l2a',{autoAlpha:1,duration:.3},T(1,.28));tl.to('.saving',{autoAlpha:1,duration:.01},T(1,.43));draw(ctx,tl,'.saving',T(1,.43),.8)
 tl.to('.tokens',{autoAlpha:1,duration:.35},T(1,.57));tl.to('.saving-label',{autoAlpha:1,duration:.35},T(1,.72))
 return finish(ctx,tl)
})
