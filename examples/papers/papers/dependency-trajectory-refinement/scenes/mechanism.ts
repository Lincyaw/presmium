import {gsapScene} from '@lincyaw/addon-motion/scene'
import {C,clock,node,edge,tx,box,mount,headers,draw,finish} from './visual.ts'
import type {Shot} from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],{T}=clock(ctx.at,ctx.durations),{gsap}=ctx
 const xs=[20,50,80,110,140],ys=[40,40,40,40,40],dest=[[35,24],[35,36],[82,36],[35,48],[35,60]]
 const nodes=xs.map((x,i)=>node(x,ys[i]!,String(i+1),shots[0]!.labels[i]!,'round r'+i,i===2?C.red:C.green)).join('')
 const seq=xs.slice(1).map((x,i)=>edge('M'+(xs[i]!+11)+',40 H'+(x-11),'seq seq'+i,C.muted,true)).join('')
 const deps=edge('M35,29 V31','dep d12')+edge('M46,36 H71','dep d23')+edge('M35,41 V43','dep d24')+edge('M35,53 V55','dep d45')
 const labels=tx(shots[0]!.labels[5]!,80,22,2.6,C.muted,'sequence-label')+tx(shots[1]!.labels[0]!,104,22,3.4,C.green,'dependency-label')+tx(shots[1]!.labels[1]!,113,50,2.8,C.muted,'usage-label')+tx(shots[1]!.labels[2]!,113,57,2.8,C.red,'unused-label')+tx(shots[2]!.labels[0]!,105,31,3.4,C.red,'leaf-label')+tx(shots[2]!.labels[1]!,105,43,2.8,C.green,'preserve-label')+tx(shots[2]!.labels[2]!,105,55,3.7,C.green,'prune-label')+tx(shots[0]!.labels[6]!,140,69,1.9,C.muted,'illustration')
 mount(ctx,shots,nodes+seq+deps+labels+box(68,28,28,16,'leaf-ring',C.red,'none'))
 const tl=gsap.timeline();headers(ctx,tl,shots,T)
 gsap.set('.round,.seq,.dep,.dependency-label,.usage-label,.unused-label,.leaf-label,.preserve-label,.prune-label,.leaf-ring',{autoAlpha:0})
 ;[.1,.28,.46,.62,.75].forEach((f,i)=>{tl.to('.r'+i,{autoAlpha:1,duration:.35},T(0,f));if(i)tl.to('.seq'+(i-1),{autoAlpha:1,duration:.3},T(0,f+.025))})
 tl.to('.seq,.sequence-label',{autoAlpha:0,duration:.35},T(1,.08))
 dest.forEach(([x,y],i)=>tl.to('.r'+i,{x:x!-xs[i]!,y:y!-ys[i]!,duration:1,ease:'power3.inOut'},T(1,.13)))
 tl.to('.dep',{autoAlpha:1,duration:.01},T(1,.38));draw(ctx,tl,'.dep',T(1,.38),.8)
 tl.to('.dependency-label',{autoAlpha:1,duration:.3},T(1,.48));tl.to('.usage-label',{autoAlpha:1,duration:.3},T(1,.58));tl.to('.unused-label',{autoAlpha:1,duration:.3},T(1,.7))
 tl.to('.leaf-ring',{autoAlpha:1,duration:.3},T(2,.18));tl.to('.leaf-label',{autoAlpha:1,duration:.3},T(2,.24))
 tl.to('.dependency-label,.usage-label,.unused-label',{autoAlpha:0,duration:.3},T(2,.29))
 tl.to('.r2',{x:95,y:-3,autoAlpha:0,duration:.9,ease:'power3.inOut'},T(2,.43));tl.to('.d23,.leaf-ring',{autoAlpha:0,duration:.4},T(2,.43))
 tl.to('.preserve-label',{autoAlpha:1,duration:.3},T(2,.55))
 // Retain the surviving evidence chain in place.
 tl.to('.prune-label',{autoAlpha:1,duration:.3},T(2,.75))
 return finish(ctx,tl)
})
