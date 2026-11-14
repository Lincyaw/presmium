import {gsapScene} from '@lincyaw/addon-motion/scene'
import {C,clock,tx,box,edge,mount,headers,finish} from './visual.ts'
import type {Shot} from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!.labels,b=shots[1]!.labels,c=shots[2]!.labels,{T}=clock(ctx.at,ctx.durations),{gsap}=ctx
 const rows=box(12,23,85,40,'paper',C.red)+tx(a[0]!,54.5,30,3.2,C.ink,'row row0')+
 tx(a[1]!,48,42,3.3,C.ink,'row row1')+tx(a[2]!,82,42,3.3,C.red,'wrong-token')+
 tx(a[3]!,54.5,55,3.3,C.ink,'row row2')+box(76,36,12,9,'error-ring',C.red,'none')+
 tx(a[4]!,80,20,2.2,C.muted,'illustration')
 const compact=box(14,28,82,24,'compact-box',C.orange)+tx(a[5]!,55,43,4.1,C.orange,'compact-text')+
 tx(a[6]!,125,31,3.2,C.orange,'logical-repair')+tx(a[7]!,125,46,3.2,C.orange,'style-change')
 const burden=box(109,29,36,27,'student',C.line)+tx(b[0]!,127,39,3.3,C.ink,'student')+tx(b[1]!,127,49,2.5,C.muted,'student')+
 edge('M96,40 H108','to-student',C.orange)+tx(b[2]!,80,22,2.8,C.muted,'ppl-caption')+tx(b[3]!,45,64,3.9,C.red,'ppl-native')+tx(b[4]!,120,64,3.9,C.orange,'ppl-refined')
 const aligned=tx(c[0]!,82,42,3.3,C.green,'correct-token')+box(76,36,12,9,'repair-ring',C.green,'none')+tx(c[1]!,125,33,3.1,C.green,'preserve')+tx(c[2]!,125,46,3.1,C.green,'preserve')+tx(c[3]!,80,64,3.3,C.green,'aligned-name')
 mount(ctx,shots,rows+compact+burden+aligned)
 const tl=gsap.timeline();headers(ctx,tl,shots,T)
 gsap.set('.row,.wrong-token,.error-ring,.compact-box,.compact-text,.logical-repair,.style-change,.student,.to-student,.ppl-caption,.ppl-native,.ppl-refined,.correct-token,.repair-ring,.preserve,.aligned-name',{autoAlpha:0})
 tl.to('.row,.wrong-token',{autoAlpha:1,duration:.4,stagger:.1},T(0,.12));tl.to('.error-ring',{autoAlpha:1,duration:.3},T(0,.33))
 tl.to('.row0,.row1,.wrong-token,.row2,.error-ring,.paper',{autoAlpha:0,duration:.45,y:-5},T(0,.58))
 tl.to('.compact-box,.compact-text',{autoAlpha:1,duration:.45},T(0,.58));tl.to('.logical-repair,.style-change',{autoAlpha:1,duration:.35,stagger:.18},T(0,.77))
 tl.to('.logical-repair,.style-change,.illustration',{autoAlpha:0,duration:.3},T(1,.08));tl.to('.student,.to-student',{autoAlpha:1,duration:.35},T(1,.43));tl.to('.compact-text',{x:7,duration:.8},T(1,.55))
 tl.to('.ppl-caption',{autoAlpha:1,duration:.3},T(1,.64));tl.to('.ppl-native,.ppl-refined',{autoAlpha:1,duration:.35},T(1,.80))
 tl.to('.student,.to-student,.compact-box,.compact-text,.ppl-caption,.ppl-native,.ppl-refined',{autoAlpha:0,duration:.3},T(2,.05))
 tl.to('.row,.wrong-token,.paper',{autoAlpha:1,y:0,duration:.3},T(2,.05))
 tl.to('.repair-ring',{autoAlpha:1,duration:.3},T(2,.43));tl.to('.wrong-token',{autoAlpha:0,duration:.3},T(2,.62));tl.to('.correct-token',{autoAlpha:1,duration:.3},T(2,.62))
 tl.to('.paper',{attr:{stroke:C.green},duration:.3},T(2,.65));tl.to('.preserve',{autoAlpha:1,duration:.35,stagger:.15},T(2,.7));tl.to('.aligned-name',{autoAlpha:1,duration:.3},T(2,.80))
 return finish(ctx,tl)
})
