import { gsapScene } from '@lincyaw/addon-motion/scene'
import { C, clock, draw, finish, headings, mount, path, rect, svg, tx } from './visual.ts'
import type { Shot } from './visual.ts'

// The source tray changes configuration when the base model changes. The model
// rectangle survives into the next state as the controlled training stage.
export default gsapScene(ctx => {
  const shots=ctx.parameters.frames as unknown as Shot[], s=shots[0]!, cost=shots[1]!, d=s.details??[], cd=cost.details??[], values=s.values??[]
  const {T}=clock(ctx.at,ctx.durations),{gsap}=ctx,tl=gsap.timeline()
  const oldOrange=Math.round((values[2]??90)/10), newOrange=Math.round((values[4]??50)/10)
  let art='<g class="mix-tray">'+rect(8,29,46,22,C.sunk)
  for(let i=0;i<10;i++) art+=rect(12+i*3.85,33,3.1,13.5,i<oldOrange?C.orange:C.blue,'mix-cell mc-'+i,i<oldOrange?C.orange:C.blue)
  art+='</g><g class="mix-label">'+tx(d[3]??'',31,24,2.9)+'</g>'
  art+='<g class="ratio ratio-old">'+tx(d[1]??'',31,64,3.8)+'</g><g class="ratio ratio-new">'+tx(d[2]??'',31,64,3.8)+'</g>'
  art+='<g class="source-legend">'+tx(s.labels[4]??'',11,56,2.1,C.orange,'start')+tx(s.labels[5]??'',11,60,2.1,C.blue,'start')+'</g>'
  art+='<g class="model-body">'+rect(66,32,29,19)+tx(d[0]??'',80.5,43,2.8,C.ink,'middle','model-name name-old')+tx(s.labels[0]??'',80.5,43,2.65,C.ink,'middle','model-name name-new')+'</g>'
  art+=path(54,42,66,42,C.line,'mix-link')+path(95,42,105,42,C.line,'score-link')
  art+='<g class="scoreboard">'+tx(d[4]??'',128,24,2.5)+'<g class="score-sft">'+rect(106,29,45,12)+tx(s.labels[1]??'',128.5,37.5,4.2)+'</g><g class="score-rl">'+rect(106,44,45,12,C.surface,'',C.pink)+tx(s.labels[2]??'',128.5,52.5,4.2,C.pink)+'</g>'
  art+='<g class="comparison-axis"><path d="M108,61 H151" fill="none" stroke="'+C.line+'" stroke-width=".3"/>'+tx('0',108,66,2,C.muted)+tx('50',151,66,2,C.muted)+'<circle class="sft-point" cx="108" cy="59" r=".8" fill="'+C.ink+'"/><circle class="rl-point" cx="108" cy="63" r=".8" fill="'+C.pink+'"/></g></g>'
  const xs=[7,46,85,124]
  for(let i=0;i<4;i++){
    art+='<g class="stage stage-'+i+'">'+(i===2?'':rect(xs[i]!,37,28,19))+tx(cost.labels[i]??'',xs[i]!+14,32,2.65)+'</g>'
    if(i<3)art+=path(xs[i]!+28,46.5,xs[i+1]!,46.5,C.line,'pipeline-link pl-'+i)
  }
  art+='<g class="pipeline-icons"><path d="M15,43 l6,-3 6,3 v7 l-6,3 -6,-3Z M15,43 l6,3 6,-3 M21,46 v7" fill="none" stroke="'+C.orange+'" stroke-width=".5"/><path d="M92,42 h14 m-14,4 h14 m-14,4 h10" stroke="'+C.line+'" stroke-width=".55" fill="none"/><path d="M132,43 l2,2 4,-4 m-6,9 2,2 4,-4" stroke="'+C.green+'" stroke-width=".65" fill="none"/></g>'
  for(let i=0;i<3;i++) art+='<circle class="flow-pulse fp-'+i+'" cx="60" cy="46.5" r=".8" fill="'+C.orange+'"/>'
  art+='<path class="cost-brace" d="M85,59 v3 h28 v-3" fill="none" stroke="'+C.ink+'" stroke-width=".6"/>'
  art+='<path class="training-reference" d="M85,59 v3 h28 v-3" fill="none" stroke="'+C.line+'" stroke-width=".35" stroke-dasharray="1 .8"/>'
  art+='<g class="range-label short-range">'+tx(cd[0]??'',99,66,2.7)+'</g><g class="range-label whole-range">'+tx(cd[1]??'',80,66,2.7)+'</g>'
  art+='<g class="conclusion">'+tx(cost.labels[4]??'',80,23,3.1)+'</g>'
  mount(ctx.root,shots,svg(art));headings(ctx,tl,shots,T)
  // Keep the retained tray above the newly introduced generation-stage sheet.
  const layer=ctx.root.querySelector('svg.layer')!
  layer.appendChild(layer.querySelector('.mix-tray')!)
  gsap.set('.ratio-new,.name-new,.score-sft,.score-rl,.comparison-axis,.stage,.pipeline-icons,.flow-pulse,.cost-brace,.training-reference,.range-label,.conclusion',{autoAlpha:0})
  draw(ctx,tl,'.mix-link',T(0,.02),.5);draw(ctx,tl,'.score-link',T(0,.17),.5)
  // Do not leave the old 90/10 visibly attached to the new model's results.
  tl.to('.name-old,.ratio-old',{autoAlpha:0,duration:.22},T(0,.04))
  tl.to('.name-new',{autoAlpha:1,duration:.3},T(0,.07))
  tl.to('.mix-cell',{fill:C.sunk,stroke:C.line,duration:.35},T(0,.09))
  tl.to('.score-sft',{autoAlpha:1,duration:.3},T(0,.24))
  tl.to('.score-rl',{autoAlpha:1,duration:.3},T(0,.37))
  tl.to('.comparison-axis',{autoAlpha:1,duration:.3},T(0,.43))
  tl.to('.sft-point',{attr:{cx:108+43*(values[0]??0)/50},duration:.8,ease:'power2.inOut'},T(0,.44))
  tl.to('.rl-point',{attr:{cx:108+43*(values[1]??0)/50},duration:.8,ease:'power2.inOut'},T(0,.49))
  for(let i=0;i<10;i++)tl.to('.mc-'+i,{fill:i<newOrange?C.orange:C.blue,stroke:i<newOrange?C.orange:C.blue,duration:.35},T(0,.61)+i*.04)
  tl.to('.ratio-new',{autoAlpha:1,duration:.3},T(0,.65))
  // Retain the tray and the model while reframing them as stages of the cost chain.
  tl.to('.mix-label,.ratio,.source-legend,.scoreboard,.model-name,.mix-link,.score-link',{autoAlpha:0,duration:.25},T(1))
  tl.to('.mix-tray',{x:29,y:6,scale:.55,transformOrigin:'50% 50%',duration:.75,ease:'power3.inOut'},T(1,.01))
  tl.to('.model-body',{x:19,y:5,duration:.75,ease:'power3.inOut'},T(1,.01))
  tl.to('.stage',{autoAlpha:1,duration:.3,stagger:.07},T(1,.06))
  tl.to('.pipeline-icons',{autoAlpha:1,duration:.3},T(1,.1))
  draw(ctx,tl,'.pl-0',T(1,.1),.5);draw(ctx,tl,'.pl-1',T(1,.14),.5);draw(ctx,tl,'.pl-2',T(1,.25),.5)
  tl.to('.cost-brace,.short-range',{autoAlpha:1,duration:.3},T(1,.12))
  tl.to('.model-body rect',{stroke:C.orange,duration:.3},T(1,.17))
  for(let i=0;i<3;i++){
    const at=T(1,.2)+i*.2
    tl.to('.fp-'+i,{autoAlpha:1,duration:.01},at)
    tl.to('.fp-'+i,{attr:{cx:99},duration:.6,ease:'power2.inOut'},at)
    tl.to('.fp-'+i,{attr:{cx:138},fill:C.green,duration:.6,ease:'power2.inOut'},at+.8)
    tl.to('.fp-'+i,{autoAlpha:0,duration:.1},at+1.4)
  }
  tl.to('.short-range',{autoAlpha:0,duration:.2},T(1,.33))
  tl.to('.cost-brace',{attr:{d:'M7,59 v3 h145 v-3'},duration:.9,ease:'power3.inOut'},T(1,.34))
  tl.to('.training-reference,.whole-range',{autoAlpha:1,duration:.3},T(1,.39))
  tl.to('.stage-0 rect',{stroke:C.orange,duration:.3},T(1,.57))
  tl.to('.conclusion',{autoAlpha:1,duration:.4},T(1,.75))
  return finish(ctx,tl)
})
