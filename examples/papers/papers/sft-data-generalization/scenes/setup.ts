import { gsapScene } from '@lincyaw/addon-motion/scene'
import { C, clock, draw, finish, headings, mount, path, rect, svg, trace, tx } from './visual.ts'
import type { Shot } from './visual.ts'

// The same model is trained on maths, then used on other domains. The twelve
// cells are task slots, not invented task scores; their outputs merge into a mean.
export default gsapScene(ctx => {
  const shots=ctx.parameters.frames as unknown as Shot[], s=shots[0]!, d=s.details??[]
  const {T}=clock(ctx.at,ctx.durations), {gsap}=ctx, tl=gsap.timeline()
  const count=Number(s.labels[2]?.match(/\d+/)?.[0]??12)
  const domains=(s.labels[3]??'').split(' · ')
  const cell=(i:number)=>({x:75+(i%4)*12,y:29+Math.floor(i/4)*10})
  let art='<g class="training-set">'+rect(7,30,28,25,C.sunk)+tx(d[0]??'',21,27,3,C.orange)+tx(s.labels[1]??'',21,60,2.7,C.orange)
  for(let i=0;i<3;i++) art+=trace(11+i*5.7,36+i*.4,C.orange,'math-sheet sheet-'+i)
  art+='</g><g class="model">'+rect(48,32,30,20)+tx(s.labels[0]??'',63,40.5,2.65)+tx(d[0]??'',63,47.5,2.4,C.muted,'middle','model-mode')+'</g>'
  art+=path(36,42,48,42,C.orange,'train-link')+path(78,42,94,42,C.line,'test-link')
  for(let i=0;i<3;i++) art+='<circle class="train-pulse tp-'+i+'" cx="35" cy="42" r="1" fill="'+C.orange+'"/>'
  art+='<g class="domain-preview">'+tx(d[1]??'',122,22,3,C.ink)+domains.map((v,i)=>rect(97,27+i*12,52,9,C.surface,'domain-box db-'+i)+tx(v,123,33+i*12,2.8,C.ink,'middle','domain-label dl-'+i)).join('')+rect(96,26,54,11,'none','domain-focus',C.green)+'</g>'
  art+='<g class="grid-label">'+tx(s.labels[2]??'',99,23,3.1)+'</g>'
  for(let i=0;i<count;i++){const p=cell(i);art+='<g class="task task-'+i+'">'+rect(p.x,p.y,9.5,7,C.surface)+tx(String(i+1),p.x+4.75,p.y+4.8,2.5,C.muted)+'</g><circle class="eval-pulse ep-'+i+'" cx="41" cy="42" r=".8" fill="'+C.green+'"/>'}
  art+=path(57,42,73,42,C.green,'eval-link')+path(122,43,132,43,C.green,'mean-link')
  art+='<g class="normal">'+tx(d[2]??'',99,62,2.5,C.green)+tx((s.labels[4]??'').split(' ')[0]??'',99,66,2.3,C.muted)+'</g>'
  art+='<g class="mean">'+rect(132,33,23,20,C.surface,'',C.green)+tx('∑ / '+count,143.5,42,4.1,C.green)+tx(d[3]??'',143.5,49,2.5)+tx((s.labels[4]??'').replace(/^\S+\s*/,''),143.5,60,2.1,C.muted)+'</g>'
  art+='<g class="transfer">'+tx(d[4]??'',57,65,2.7,C.green)+'</g>'
  mount(ctx.root,shots,svg(art));headings(ctx,tl,shots,T)
  gsap.set('.train-pulse,.domain-preview,.grid-label,.task,.eval-pulse,.normal,.mean,.transfer',{autoAlpha:0})
  draw(ctx,tl,'.train-link',T(0,.08),.6)
  for(let i=0;i<3;i++){
    tl.to('.tp-'+i,{autoAlpha:1,duration:.01},T(0,.14)+i*.25)
    tl.to('.tp-'+i,{attr:{cx:63},duration:.65,ease:'power2.inOut'},T(0,.14)+i*.25)
    tl.to('.tp-'+i,{autoAlpha:0,duration:.15},T(0,.14)+i*.25+.65)
  }
  tl.to('.model rect',{stroke:C.orange,duration:.3},T(0,.24))
  tl.to('.domain-preview',{autoAlpha:1,duration:.35},T(0,.3))
  draw(ctx,tl,'.test-link',T(0,.28),.6)
  domains.forEach((_,i)=>{
    tl.to('.domain-focus',{attr:{y:26+i*12},duration:.5,ease:'power2.inOut'},T(0,.31+i*.05))
    tl.to('.db-'+i,{fill:C.sunk,stroke:C.green,duration:.3},T(0,.33+i*.05))
  })
  tl.to('.domain-preview,.training-set,.train-link,.test-link,.model-mode',{autoAlpha:0,duration:.3},T(0,.45))
  tl.to('.model',{x:-22,duration:.8,ease:'power3.inOut'},T(0,.44))
  tl.to('.model rect',{stroke:C.green,duration:.4},T(0,.47))
  tl.to('.grid-label',{autoAlpha:1,duration:.3},T(0,.47))
  draw(ctx,tl,'.eval-link',T(0,.47),.5)
  for(let i=0;i<count;i++){
    const p=cell(i), at=T(0,.48)+i*.11
    tl.to('.ep-'+i,{autoAlpha:1,duration:.01},at)
    tl.to('.ep-'+i,{attr:{cx:p.x+4.75,cy:p.y+3.5},duration:.6,ease:'power2.inOut'},at)
    tl.to('.ep-'+i,{autoAlpha:0,duration:.08},at+.6)
    tl.to('.task-'+i,{autoAlpha:1,duration:.2},at+.55)
  }
  tl.to('.transfer',{autoAlpha:1,duration:.4},T(0,.68))
  tl.to('.normal',{autoAlpha:1,duration:.3},T(0,.84))
  tl.to('.task rect',{stroke:C.green,duration:.3,stagger:.035},T(0,.85))
  draw(ctx,tl,'.mean-link',T(0,.89),.5)
  tl.to('.mean',{autoAlpha:1,duration:.4},T(0,.92))
  return finish(ctx,tl)
})
