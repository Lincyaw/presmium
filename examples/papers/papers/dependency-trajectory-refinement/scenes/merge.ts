import {gsapScene} from '@lincyaw/addon-motion/scene'
import {C,clock,node,edge,tx,box,mount,headers,draw,finish} from './visual.ts'
import type {Shot} from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!.labels,b=shots[1]!.labels,{T}=clock(ctx.at,ctx.durations),{gsap}=ctx
 const graph=node(21,42,'1',a[0]!,'parent')+node(63,29,'2',a[1]!,'query-a')+node(63,56,'3',a[2]!,'query-b')+node(112,42,'4',a[3]!,'consumer')
 const links=edge('M32,42 C42,42 42,29 52,29','links upstream-a')+edge('M32,42 C42,42 42,56 52,56','links upstream-b')+edge('M74,29 C87,29 87,42 101,42','links downstream-a')+edge('M74,56 C87,56 87,42 101,42','links downstream-b')
 const ring=box(47,19,32,47,'merge-ring',C.teal,'none')+tx(a[4]!,80,18,2.9,C.green,'shared')+tx(a[5]!,80,67,3.3,C.green,'merged-label')
 const body=box(14,25,61,14,'raw-a')+tx(b[0]!,44,34,2.8,C.ink,'raw-a')+box(85,25,61,14,'raw-b')+tx(b[1]!,116,34,2.8,C.ink,'raw-b')+box(25,25,110,14,'coherent',C.green)+tx(b[2]!,80,34,3.0,C.green,'coherent')+edge('M65,32 H95','bridge',C.green)+box(25,49,110,12,'tools',C.line)+tx(b[3]!,80,57,2.7,C.muted,'tools')+tx(b[4]!,80,66,3.4,C.green,'l2a')
 mount(ctx,shots,'<g class="graph">'+graph+links+ring+'</g><g class="text-stage">'+body+'</g>')
 const tl=gsap.timeline();headers(ctx,tl,shots,T)
 gsap.set('.parent,.query-a,.query-b,.consumer,.links,.merge-ring,.shared,.merged-label,.text-stage,.coherent,.bridge,.l2a',{autoAlpha:0})
 tl.to('.parent',{autoAlpha:1,duration:.25},T(0,.08));tl.to('.query-a,.query-b,.consumer',{autoAlpha:1,duration:.35,stagger:.12},T(0,.15));tl.to('.links',{autoAlpha:1,duration:.01},T(0,.25));draw(ctx,tl,'.links',T(0,.25),.8)
 tl.to('.merge-ring,.shared',{autoAlpha:1,duration:.4},T(0,.46))
 tl.to('.query-a',{y:13.5,duration:.85,ease:'power3.inOut'},T(0,.65));tl.to('.query-b',{y:-13.5,duration:.85,ease:'power3.inOut'},T(0,.65))
 tl.to('.query-b',{autoAlpha:0,duration:.2},T(0,.65)+.75)
 tl.to('.upstream-a,.upstream-b',{attr:{d:'M32,42 H52'},duration:.85},T(0,.65));tl.to('.downstream-a,.downstream-b',{attr:{d:'M74,42 H101'},duration:.85},T(0,.65))
 tl.to('.merge-ring',{attr:{y:34,height:17},duration:.85},T(0,.65));tl.to('.query-a rect',{attr:{x:47,width:32},duration:.85},T(0,.65));tl.set('.query-a text:first-of-type',{textContent:'2+3'},T(0,.65)+.85);tl.set('.query-a text:last-of-type',{textContent:a[1]+' + '+a[2]!.replace(a[1]!.slice(0,-1),'')},T(0,.65)+.85);tl.to('.merged-label',{autoAlpha:1,duration:.3},T(0,.82))
 tl.to('.graph',{autoAlpha:0,duration:.3},T(1,.04));tl.to('.text-stage',{autoAlpha:1,duration:.3},T(1,.04))
 tl.to('.raw-a',{x:11,duration:.65},T(1,.20));tl.to('.raw-b',{x:-11,duration:.65},T(1,.20))
 tl.to('.bridge',{autoAlpha:1,duration:.01},T(1,.48));draw(ctx,tl,'.bridge',T(1,.48),.65)
 tl.to('.raw-a,.raw-b,.bridge',{autoAlpha:0,duration:.3},T(1,.58));tl.to('.coherent',{autoAlpha:1,duration:.5},T(1,.60))
 tl.to('rect.tools',{attr:{'stroke':C.green},duration:.3},T(1,.66));tl.to('.l2a',{autoAlpha:1,duration:.3},T(1,.80))
 return finish(ctx,tl)
})
