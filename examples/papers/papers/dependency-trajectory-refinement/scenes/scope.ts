import {gsapScene} from '@lincyaw/addon-motion/scene'
import {C,clock,node,edge,tx,box,mount,headers,finish} from './visual.ts'
import type {Shot} from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!.labels,{T}=clock(ctx.at,ctx.durations),{gsap}=ctx
 const body=node(31,35,'A',a[0]!,'packet-a')+node(31,55,'B',a[1]!,'packet-b')+box(82,24,29,38,'protocol',C.line)+tx(a[2]!,96.5,32,2.7,C.ink,'protocol')+tx(a[3]!,96.5,41,2.8,C.green,'protocol')+
 edge('M111,43 H141','out')+tx(a[5]!,80,67,3.4,C.green,'condition')+tx(a[4]!,136,47,3.4,C.red,'retry')+box(47,35,30,27,'double-package',C.red,'none')
 mount(ctx,shots,body)
 const tl=gsap.timeline();headers(ctx,tl,shots,T)
 gsap.set('.protocol,.condition,.retry,.double-package,.out',{autoAlpha:0})
 tl.to('.packet-a',{x:30,y:7,duration:.8,ease:'power3.inOut'},T(0,.18));tl.to('.packet-b',{x:30,y:-2,duration:.8,ease:'power3.inOut'},T(0,.18));tl.to('.double-package',{autoAlpha:1,duration:.3},T(0,.3))
 tl.to('.protocol',{autoAlpha:1,duration:.35},T(0,.43));tl.to('.packet-a,.packet-b,.double-package',{x:'+=12',duration:.7},T(0,.51))
 tl.to('.packet-b',{x:0,y:0,duration:.7,ease:'power3.inOut'},T(0,.66));tl.to('.double-package',{autoAlpha:0,duration:.3},T(0,.66));tl.to('.retry',{autoAlpha:1,duration:.3},T(0,.67))
 tl.to('.condition',{autoAlpha:1,duration:.3},T(0,.80))
 return finish(ctx,tl)
})
