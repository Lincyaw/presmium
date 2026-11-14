import { gsapScene } from '@lincyaw/addon-motion/scene'
import { C, clock, draw, finish, headings, mount, path, rect, svg, trace, tx } from './visual.ts'
import type { Shot } from './visual.ts'
import coverageFigure from '../figures/coverage.png'

// The source raster has a white paper ground even in the dark theme.
const paperInk = '#202020'

export default gsapScene(ctx => {
  const shots = ctx.parameters.frames as unknown as Shot[]
  const a = shots[0]!, b = shots[1]!, c = shots[2]!
  const ad = (i: number) => a.details?.[i] ?? ''
  const bd = (i: number) => b.details?.[i] ?? ''
  const cd = (i: number) => c.details?.[i] ?? ''
  const [total, initial, final, threshold] = a.values!
  const orange = b.series![0]!, blue = b.series![1]!, ks = b.values!
  const { gsap } = ctx, { T } = clock(ctx.at, ctx.durations)
  const gx = (i: number) => 11 + (i % 23) * 3.65
  const gy = (i: number) => 40 + Math.floor(i / 23) * 4.3
  let grid = ''
  for (let i=0;i<total!;i++) {
    grid += '<circle class="socket socket-'+i+'" cx="'+gx(i)+'" cy="'+gy(i)+'" r="1.12" fill="'+C.surface+'" stroke="'+C.line+'" stroke-width=".24"/>'
    if(i<final!) grid += '<circle class="'+(i<initial!?'initial-fill initial-fill-'+i:'new-fill new-fill-'+i)+'" cx="'+gx(i)+'" cy="'+gy(i)+'" r="1.12" fill="'+C.orange+'"/>'
  }
  const annotate = '<g class="annotation-card">'+trace(10,22,C.orange)+tx(ad(0),27,27,2.8,C.orange,'middle','annotation-caption')+'</g>' +
    '<circle class="method-token" cx="16" cy="30" r="1.25" fill="'+C.orange+'"/>'
  const thresholdArt = '<g class="threshold-group">'+
    tx(ad(3),59,23,2.7,C.muted)+rect(43,26,39,3.7,C.sunk)+
    rect(43,26,38.6,3.7,C.orange,'threshold-meter',C.orange)+
    tx(String(threshold!-1),89,29.5,4.6,C.orange,'middle','threshold-number')+
    tx(a.labels[1]!,63,35,2.8,C.ink,'middle','threshold-rule')+
    tx(ad(1),92,35,2.1,C.muted)+'</g>'
  const incoming = Array.from({length:7},(_,i)=>trace(22+i*10,22,C.orange,'extra-trajectory extra-trajectory-'+i)).join('')
  const introduction = '<g class="coverage-intro">'+annotate+thresholdArt+incoming+
    tx(a.labels[0]!,130,27,4.4,C.ink,'middle','method-total')+
    tx(ad(6),130,44,2.75,C.muted,'middle','global-label')+
    tx(String(initial!),130,55,8.2,C.orange,'middle','coverage-counter')+
    tx(a.labels[2]!,130,63,2.9,C.orange,'middle','first-budget')+
    tx(a.labels[3]!,130,63,2.9,C.orange,'middle','last-budget')+
    tx(a.labels[4]!,49,65.5,2.3,C.muted,'middle','grid-illustration')+'</g>'
  const fy = (v: number) => 962 - (v-100)*(924/37)
  const centers = [374,765,1156,1548]
  const plotMarks = '<rect class="coverage-wash" width="1754" height="1116" fill="'+C.surface+'" opacity=".6"/>'+
    '<rect class="coverage-axis-x" x="182" y="965" width="1550" height="150" rx="12" fill="none" stroke="'+C.orange+'" stroke-width="11"/>'+
    '<rect class="coverage-axis-y" x="5" y="25" width="180" height="940" rx="12" fill="none" stroke="'+C.orange+'" stroke-width="11"/>'+
    '<rect class="coverage-focus" x="239" y="807" width="270" height="160" rx="12" fill="none" stroke="'+paperInk+'" stroke-width="11"/>'+
    '<path class="coverage-orange-guide" d="'+centers.map((x,i)=>(i?' L':'M')+(x+58)+','+fy(orange.values[i]!)).join('')+'" fill="none" stroke="'+C.orange+'" stroke-width="10" stroke-linejoin="round"/>'+
    '<path class="coverage-blue-guide" d="'+centers.map((x,i)=>(i?' L':'M')+(x-58)+','+fy(blue.values[i]!)).join('')+'" fill="none" stroke="'+C.blue+'" stroke-width="10" stroke-linejoin="round"/>'
  const plot = '<g class="coverage-figure-stage"><svg class="coverage-paper" x="6" y="21" width="99" height="45" viewBox="0 0 1754 1116" preserveAspectRatio="xMidYMid meet" style="overflow:hidden">'+
    '<image href="'+coverageFigure+'" width="1754" height="1116"/>'+plotMarks+'</svg>'+
    tx(a.labels[0]!,131,34,2.5,C.muted,'middle','grid-memory')+
    tx(bd(0),131,41,2.6,C.muted,'middle','k-caption')+
    tx(String(ks[0]!),131,47,5.1,C.ink,'middle','k-value')+
    tx(orange.name+' · '+orange.values[0],131,53,2.7,C.orange,'middle','orange-read')+
    tx(blue.name+' · '+blue.values[0],131,58,2.7,C.blue,'middle','blue-read')+
    '<g class="frequency-ruler">'+rect(111,62,39,2.8,C.sunk)+rect(142.2,62,7.8,2.8,C.orange,'frequency-rare',C.orange)+
    tx(bd(2).split('：')[0]!,131,61,2.4,C.ink,'middle','tail-name')+
    tx(bd(2).split('：')[1]??'',131,68,2.3,C.orange,'middle','tail-definition')+'</g></g>'
  const rollouts = c.rollouts ?? []
  const training = rollouts.map((r,i)=>{
    const x=12+i*8.4, tail=r.method===1
    return '<g class="training-card training-card-'+i+(tail?' training-with-tail':'')+'">'+trace(x,25,C.muted)+
      (tail?'<path class="tail-tag" d="M'+(x+6)+',27 l2,2 -2,2 -2,-2Z" fill="'+C.orange+'"/>':'')+'</g>'
  }).join('')
  const complete = rollouts.map((r,i)=>{
    const x=100+i*7.5, tail=r.method===1
    return trace(x,25,C.orange,'complete-card')+(tail?'<path d="M'+(x+6)+',27 l2,2 -2,2 -2,-2Z" fill="'+C.orange+'"/>':'')
  }).join('')
  const max = Math.ceil(Math.max(...c.values!)/20)*20
  const baseY=62.5, barH=14.5, barY=(v:number)=>baseY-v/max*barH
  const barXs=[35,117]
  const bars = c.values!.map((v,i)=>{
    const color=i?C.orange:C.muted
    return '<g class="usage-result usage-result-'+i+'">'+
      rect(barXs[i]!,baseY,15,0,color,'usage-bar usage-bar-'+i,color)+
      tx(String(v),barXs[i]!+7.5,barY(v)-2,5.4,color,'middle','usage-number usage-number-'+i)+
      tx(i?cd(3):cd(2),barXs[i]!+7.5,66,2.7,C.ink,'middle','usage-dataset')+'</g>'
  }).join('')
  const ticks=[0,max/3,max*2/3,max].map(v=>'<path d="M29,'+barY(v)+' H136" stroke="'+C.line+'" stroke-width=".18"/>'+tx(String(Math.round(v)),27,barY(v)+.7,2.0,C.muted,'end')).join('')
  const testTraces = [0,1].map(i=>{
    const x=i?93:11
    return '<g class="test-trace test-trace-'+i+'">'+trace(x,50,C.green)+trace(x+2,49,C.green)+
      '<path d="M'+(x+3)+',57 l1.3,1.5 2.9,-3.3" fill="none" stroke="'+C.green+'" stroke-width=".6"/>'+
      tx(cd(4),x+9,46.5,2.2,C.muted)+'</g>'
  }).join('')
  const usageTags=c.values!.map((v,i)=>Array.from({length:v},(_,j)=>{
    const x=(i?98:16)+(j%3)*.6,y=52+(j%5)*.6
    return '<circle class="usage-tag usage-tag-'+i+' usage-tag-'+i+'-'+j+'" cx="'+x+'" cy="'+y+'" r=".58" fill="'+C.orange+'"/>'
  }).join('')).join('')
  const multi = '<g class="multilabel">'+trace(72,49,C.green)+
    '<path d="M80,52 L85,50 M80,57 L85,60" fill="none" stroke="'+C.line+'" stroke-width=".4"/>'+
    '<rect x="85" y="48.7" width="4" height="2.8" rx=".7" fill="'+C.orange+'"/>'+
    '<rect x="85" y="58.6" width="4" height="2.8" rx=".7" fill="'+C.orange+'"/>'+
    tx(cd(7),80,45,2.4,C.ink)+'</g>'
  const tail = '<g class="tail-stage">'+
    tx(cd(0),80,17.6,2.7,C.muted,'middle','training-illustration')+training+
    tx(cd(1),40,42,2.65,C.orange,'middle','filter-label')+
    tx(cd(2),40,42,2.65,C.ink,'middle','head-only-label')+
    tx(cd(3),123,21,2.7,C.ink,'middle','full-label')+complete+
    '<path class="filter-route" d="M26,37 C26,43 12,43 4,44" fill="none" stroke="'+C.orange+'" stroke-width=".5"/>'+
    '<path class="filter-route" d="M51,37 C51,43 23,43 4,44" fill="none" stroke="'+C.orange+'" stroke-width=".5"/>'+
    '<g class="usage-chart">'+ticks+bars+
    tx(c.labels[0]!,80,21,3.0,C.ink,'middle','test-task')+
    tx(cd(5),80,34,2.4,C.muted,'middle','usage-caption')+tx(cd(6),80,39,2.7,C.muted,'middle','usage-caption')+'</g>'+
    testTraces+usageTags+multi+
    tx(cd(8),80,17.6,2.1,C.muted,'middle','sample-limit')+'</g>'
  mount(ctx.root,shots,svg(introduction+'<g class="method-grid">'+grid+'</g>'+plot+tail))
  const tl=gsap.timeline()
  headings(ctx,tl,shots,T)
  gsap.set('.method-grid',{attr:{transform:'translate(0 0) scale(1)'}})
  gsap.set('.annotation-card,.method-token,.threshold-group,.extra-trajectory,.method-total,.initial-fill,.new-fill,.coverage-counter,.global-label,.first-budget,.last-budget,.grid-illustration,.coverage-figure-stage,.tail-stage',{autoAlpha:0})
  // A tag is counted first; only crossing the occurrence threshold fills its method socket.
  tl.to('.annotation-card',{autoAlpha:1,duration:.3},T(0,.075))
  tl.to('.method-total',{autoAlpha:1,duration:.3},T(0,.2554))
  tl.to('.threshold-group',{autoAlpha:1,duration:.3},T(0,.28))
  tl.to('.method-token',{autoAlpha:1,duration:.01},T(0,.31))
  tl.to('.method-token',{attr:{cx:76,cy:28},duration:.65,ease:'power3.inOut'},T(0,.31))
  tl.to('.threshold-number',{textContent:threshold!,duration:.4,modifiers:{textContent:(v:string)=>String(Math.round(+v))}},T(0,.3661))
  tl.to('.threshold-meter',{attr:{width:39},duration:.4},T(0,.3661))
  tl.to('.method-token',{attr:{cx:gx(0),cy:gy(0)},duration:.65,ease:'power3.inOut'},T(0,.39))
  tl.to('.initial-fill-0',{autoAlpha:1,duration:.15},T(0,.425))
  tl.to('.method-token',{autoAlpha:0,duration:.1},T(0,.43))
  tl.to('.grid-illustration',{autoAlpha:1,duration:.3},T(0,.4885))
  tl.to('.threshold-group',{autoAlpha:0,duration:.25},T(0,.58))
  tl.to('.initial-fill',{autoAlpha:1,duration:.2,stagger:.004},T(0,.61))
  tl.to('.global-label,.coverage-counter,.first-budget',{autoAlpha:1,duration:.3},T(0,.65))
  tl.to('.annotation-caption',{autoAlpha:0,duration:.2},T(0,.7))
  tl.to('.extra-trajectory',{autoAlpha:1,duration:.3,stagger:.045},T(0,.735))
  // A method enters the coverage count exactly when its own tag finishes landing.
  const addedCount = final! - initial!
  const arrivalSpan = T(0,.9428) - T(0,.8816)
  for(let i=initial!;i<final!;i++) {
    const j = i - initial!
    const arrival = T(0,.8816) + (j+1) * arrivalSpan / addedCount
    const start = arrival - .6
    const el=ctx.root.querySelector('.new-fill-'+i)!
    const fromX=26+(j%7)*10,fromY=29
    gsap.set(el,{x:fromX-gx(i),y:fromY-gy(i),attr:{r:.72}})
    tl.to(el,{autoAlpha:1,duration:.01},start)
    tl.to(el,{x:0,y:0,duration:.6,ease:'power3.inOut'},start)
    tl.set(el,{attr:{r:1.12}},arrival)
    tl.set('.coverage-counter',{textContent:initial!+j+1},arrival)
  }
  tl.to('.first-budget',{autoAlpha:0,duration:.15},T(0,.9))
  tl.to('.last-budget',{autoAlpha:1,duration:.2},T(0,.9428))

  // Carry the actual method grid into the next evidence shot; the original figure now explains the observed growth.
  tl.to('.coverage-intro',{autoAlpha:0,duration:.25},T(1))
  tl.to('.method-grid',{attr:{transform:'translate(108 8) scale(.35)'},duration:.7,ease:'power3.inOut'},T(1,.015))
  tl.to('.coverage-figure-stage',{autoAlpha:1,duration:.35},T(1,.02))
  gsap.set('.coverage-axis-x,.coverage-axis-y,.coverage-focus,.coverage-orange-guide,.coverage-blue-guide,.orange-read,.blue-read,.frequency-ruler,.tail-definition',{autoAlpha:0})
  tl.to('.coverage-axis-x',{autoAlpha:1,duration:.2},T(1,.0484))
  tl.to('.coverage-axis-x',{autoAlpha:0,duration:.2},T(1,.16))
  tl.to('.coverage-axis-y',{autoAlpha:1,duration:.2},T(1,.1955))
  tl.to('.coverage-axis-y',{autoAlpha:0,duration:.2},T(1,.29))
  tl.to('.coverage-wash',{opacity:0,duration:.4},T(1,.3))
  tl.to('.orange-read',{autoAlpha:1,duration:.3},T(1,.3163))
  tl.to('.blue-read',{autoAlpha:1,duration:.3},T(1,.4563))
  const focuses=[.54,.59,.64,.69]
  const views=['150 580 850 480','510 340 880 650','900 55 850 670','1130 0 620 540']
  focuses.forEach((f,i)=>{
    const top=fy(Math.max(orange.values[i]!,blue.values[i]!))-25
    const h=Math.max(130,Math.abs(fy(orange.values[i]!)-fy(blue.values[i]!))+60)
    tl.to('.coverage-focus',{autoAlpha:1,attr:{x:centers[i]!-135,y:top,height:h},duration:.55,ease:'power3.inOut'},T(1,f))
    tl.to('.coverage-paper',{attr:{viewBox:views[i]},duration:.6,ease:'power3.inOut'},T(1,f))
    tl.to('.k-value',{textContent:ks[i]!,duration:.22,modifiers:{textContent:(v:string)=>String(Math.round(+v))}},T(1,f+.015))
    tl.to('.orange-read',{textContent:orange.name+' · '+orange.values[i],duration:.01},T(1,f+.025))
    tl.to('.blue-read',{textContent:blue.name+' · '+blue.values[i],duration:.01},T(1,f+.025))
  })
  tl.to('.coverage-orange-guide,.coverage-blue-guide',{autoAlpha:1,duration:.01},T(1,.55))
  draw(ctx,tl,'.coverage-orange-guide,.coverage-blue-guide',T(1,.55),T(1,.73)-T(1,.55))
  tl.to('.coverage-paper',{attr:{viewBox:'0 0 1754 1116'},duration:.65,ease:'power3.inOut'},T(1,.735))
  tl.to('.frequency-ruler',{autoAlpha:1,duration:.3},T(1,.7573))
  tl.to('.tail-definition',{autoAlpha:1,duration:.25},T(1,.9234))

  // The left training sample visibly loses trajectories carrying the tail tag; the complete sample remains.
  tl.to('.coverage-figure-stage,.method-grid',{autoAlpha:0,duration:.22},T(2))
  tl.to('.tail-stage',{autoAlpha:1,duration:.01},T(2))
  gsap.set('.head-only-label,.full-label,.usage-chart,.test-trace,.usage-tag,.usage-number,.multilabel,.sample-limit',{autoAlpha:0})
  draw(ctx,tl,'.filter-route',T(2,.0216),.6)
  tl.to('.training-with-tail',{x:-32,y:10,autoAlpha:.15,duration:.8,ease:'power3.inOut',stagger:.08},T(2,.045))
  tl.to('.filter-label',{autoAlpha:0,duration:.2},T(2,.125))
  tl.to('.filter-route',{autoAlpha:0,duration:.25},T(2,.17))
  tl.to('.training-with-tail',{autoAlpha:0,duration:.2},T(2,.18))
  tl.to('.head-only-label',{autoAlpha:1,duration:.25},T(2,.1515))
  tl.to('.full-label',{autoAlpha:1,duration:.25},T(2,.238))
  tl.to('.usage-chart',{autoAlpha:1,duration:.3},T(2,.33))
  tl.to('.test-trace',{autoAlpha:1,duration:.3},T(2,.39))
  // Every small incoming object is one usage, accumulated over the pictured test set, not one solved question.
  const arrivals=[.5494,.5985]
  c.values!.forEach((v,i)=>{
    const start=arrivals[i]!-.045
    const stagger=.2/v
    for(let j=0;j<v;j++) {
      const target='.usage-tag-'+i+'-'+j
      tl.to(target,{autoAlpha:1,duration:.01},T(2,start)+j*stagger)
      tl.to(target,{attr:{cx:barXs[i]!+7.5,cy:barY(v)+2},duration:.5,ease:'power3.inOut'},T(2,start)+j*stagger)
      tl.to(target,{autoAlpha:0,duration:.06},T(2,start)+j*stagger+.5)
    }
    tl.to('.usage-bar-'+i,{attr:{y:barY(v),height:baseY-barY(v)},duration:.6,ease:'power2.out'},T(2,arrivals[i]!-.015))
    tl.to('.usage-number-'+i,{autoAlpha:1,duration:.15},T(2,arrivals[i]!))
  })
  tl.to('.multilabel',{autoAlpha:1,duration:.3},T(2,.7074))
  tl.to('.training-illustration',{autoAlpha:0,duration:.2},T(2,.91))
  tl.to('.sample-limit',{autoAlpha:1,duration:.25},T(2,.945))
  return finish(ctx,tl)
})
