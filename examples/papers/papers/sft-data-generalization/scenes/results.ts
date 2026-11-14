import { gsapScene } from '@lincyaw/addon-motion/scene'
import { C, clock, draw, finish, headings, mount, path, rect, svg, trace, tx } from './visual.ts'
import type { Shot } from './visual.ts'
import budgetFigure from '../figures/budget.png'
import mixFigure from '../figures/mix.png'

// The imported figures retain their white paper, in both application themes.
const paperInk = '#202020'
const original = (cls: string, src: string, w: number, h: number, marks: string) =>
  '<svg class="' + cls + '" x="7" y="21" width="100" height="45" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet" style="overflow:hidden">' +
  '<image href="' + src + '" width="' + w + '" height="' + h + '"/>' + marks + '</svg>'

export default gsapScene(ctx => {
  const shots = ctx.parameters.frames as unknown as Shot[]
  const a = shots[0]!, b = shots[1]!, av = a.values!, bv = b.values!
  const ad = (i: number) => a.details?.[i] ?? ''
  const bd = (i: number) => b.details?.[i] ?? ''
  const { gsap } = ctx, { T } = clock(ctx.at, ctx.durations)
  const bx = [685, 1207, 1730, 2250]
  const by = (v: number) => 1365 - (v - 30) * (1180 / 17.5)
  const base = av[4]!
  const marks =
    '<rect class="paper-wash" x="0" y="0" width="2510" height="1683" fill="' + C.surface + '" opacity=".68"/>' +
    '<rect class="axis-x" x="290" y="1370" width="2200" height="260" rx="15" fill="none" stroke="' + C.orange + '" stroke-width="13"/>' +
    '<rect class="axis-y" x="10" y="270" width="285" height="1090" rx="15" fill="none" stroke="' + C.orange + '" stroke-width="13"/>' +
    '<rect class="bar-focus" x="580" y="' + (by(av[0]!) - 90) + '" width="210" height="' + (1450 - by(av[0]!)) + '" rx="14" fill="none" stroke="' + C.orange + '" stroke-width="14"/>' +
    '<path class="baseline-guide" d="M300,' + by(base) + ' H2480" fill="none" stroke="' + C.pink + '" stroke-width="15"/>' +
    '<path class="gap-brace" d="M800,' + by(base) + ' h45 M823,' + by(base) + ' V' + by(av[0]!) + ' M800,' + by(av[0]!) + ' h45" fill="none" stroke="' + paperInk + '" stroke-width="13"/>'
  const budget = '<g class="budget-stage">' + original('budget-paper', budgetFigure, 2510, 1683, marks) +
    tx(ad(4), 130, 24, 3.0, C.muted, 'middle', 'budget-axis-label') +
    [ad(0),ad(1),ad(2),ad(3)].map((s,i)=>tx(s,130,34,3.4,C.ink,'middle','budget-name budget-name-'+i)).join('') +
    av.slice(0,4).map((v,i)=>tx(v.toFixed(1),130,45,7.4,C.orange,'middle','budget-value budget-value-'+i)).join('') +
    tx(ad(5)+' '+base.toFixed(1),130,54,3.2,C.pink,'middle','baseline-label') +
    av.slice(0,4).map((v,i)=>tx(ad(6)+' '+(base-v).toFixed(1),130,63,3.2,C.ink,'middle','budget-gap budget-gap-'+i)).join('') +
    '</g>'
  const samples = Array.from({length:10},(_,i)=>{
    const x=111+i*4.1,color=i<9?C.orange:C.blue
    return '<g class="mix-sample mix-sample-'+i+'">'+rect(x,25,3.3,5.6,C.surface,'',color)+'<path d="M'+(x+.6)+',26.5 h2.1 m-2.1,1.3 h1.6 m-1.6,1.3 h2.1" fill="none" stroke="'+color+'" stroke-width=".25"/></g>'
  }).join('')
  const mixMarks = '<rect class="mix-paper-wash" x="0" y="0" width="2520" height="1532" fill="' + C.surface + '" opacity=".64"/>' +
    '<rect class="mix-bar-focus" x="780" y="185" width="345" height="1160" rx="15" fill="none" stroke="' + C.orange + '" stroke-width="16"/>' +
    '<path class="mix-reference" d="M235,320 H2485" fill="none" stroke="' + C.pink + '" stroke-width="15"/>'
  const scale = (v: number) => 112 + (v - 42) * 9.0
  const error = (value: number, error: number, y: number, cls: string, color: string) =>
    '<g class="' + cls + '"><path d="M'+scale(value-error)+','+y+' H'+scale(value+error)+' M'+scale(value-error)+','+(y-1.2)+' v2.4 M'+scale(value+error)+','+(y-1.2)+' v2.4" fill="none" stroke="'+color+'" stroke-width=".65"/><circle cx="'+scale(value)+'" cy="'+y+'" r=".95" fill="'+color+'"/></g>'
  const mixed = '<g class="mixed-stage">' +
    '<g class="mix-process">' + samples +
    tx(bd(0),130,21,2.8,C.muted,'middle','mix-caption') +
    tx(String(bv[4]!)+'% '+bd(6),130,35,2.4,C.orange,'middle','ratio-orange') +
    tx(String(bv[5]!)+'% '+bd(7),130,40,2.4,C.blue,'middle','ratio-blue') +
    rect(112,45,37,14,C.surface,'mix-model') + tx(bd(1),130.5,53,3.0,C.ink,'middle','mix-model-label') +
    path(130,41,130,45,C.line,'mix-flow') + '</g>' +
    '<g class="mix-evidence">' + original('mix-paper',mixFigure,2520,1532,mixMarks) +
    tx(bd(4),131,25,3.6,C.ink,'middle','mix-conclusion') +
    tx(b.labels[0]!,130,31,2.5,C.orange,'middle','mix-ratio-note') + tx(b.labels[1]!,130,35,2.4,C.blue,'middle','mix-ratio-note') +
    tx(bv[0]!.toFixed(1)+' ± '+bv[2]!.toFixed(2),130,42,5.1,C.orange,'middle','mix-score') +
    error(bv[0]!,bv[2]!,47,'sft-error',C.orange) +
    tx(bd(5)+' '+bv[1]!.toFixed(1)+' ± '+bv[3]!.toFixed(2),130,56,3.05,C.pink,'middle','mix-rl') +
    error(bv[1]!,bv[3]!,61,'rl-error',C.pink) +
    tx(bd(3),130,25,2.6,C.muted,'middle','error-caption') +
    '<g class="error-axis"><path d="M'+scale(42)+',64.2 H'+scale(46)+'" stroke="'+C.line+'" stroke-width=".25"/>'+
    [42,43,44,45,46].map(v=>'<path d="M'+scale(v)+',63.6 v1.2" stroke="'+C.line+'" stroke-width=".25"/>'+tx(String(v),scale(v),67,1.7,C.muted)).join('')+'</g>' +
    '</g></g>'
  mount(ctx.root, shots, svg(budget+mixed))
  const tl = gsap.timeline()
  headings(ctx,tl,shots,T)
  gsap.set('.mixed-stage,.axis-x,.axis-y,.bar-focus,.baseline-guide,.gap-brace,.budget-axis-label,.budget-name,.budget-value,.budget-gap,.baseline-label',{autoAlpha:0})
  // First establish the two encodings, before selecting any result.
  tl.to('.budget-paper',{attr:{viewBox:'130 100 2380 1530'},duration:.75,ease:'power3.inOut'},T(0,.025))
  tl.to('.axis-x',{autoAlpha:1,duration:.25},T(0,.0371))
  tl.to('.budget-axis-label',{autoAlpha:1,duration:.3},T(0,.2984))
  tl.to('.axis-x',{autoAlpha:0,duration:.2},T(0,.275))
  tl.to('.axis-y',{autoAlpha:1,duration:.25},T(0,.2984))
  tl.to('.axis-y',{autoAlpha:0,duration:.2},T(0,.38))
  tl.to('.paper-wash',{opacity:0,duration:.35},T(0,.39))
  // The second group stays identifiable as a control, then the cursor follows the narrated orange bars.
  tl.to('.budget-name-1',{autoAlpha:1,duration:.25},T(0,.14))
  tl.to('.budget-name-1',{autoAlpha:0,duration:.2},T(0,.34))
  const stages = [{i:0,f:.51,box:'310 320 920 1110'},{i:2,f:.65,box:'1250 260 1100 1190'},{i:3,f:.77,box:'1570 260 940 1190'}]
  stages.forEach(({i,f,box},j)=>{
    if(j) {
      const previous = stages[j-1]!.i
      tl.to('.budget-name-'+previous+',.budget-value-'+previous+',.budget-gap-'+previous,{autoAlpha:0,duration:.18},T(0,f))
    }
    tl.to('.budget-paper',{attr:{viewBox:box},duration:.72,ease:'power3.inOut'},T(0,f))
    tl.to('.bar-focus',{autoAlpha:1,attr:{x:bx[i]!-105,y:by(av[i]!)-90,height:1450-by(av[i]!)},duration:.65,ease:'power3.inOut'},T(0,f))
    tl.to('.budget-name-'+i+',.budget-value-'+i,{autoAlpha:1,duration:.3},T(0,f+.035))
    tl.to('.gap-brace',{autoAlpha:1,attr:{d:'M'+(bx[i]!+110)+','+by(base)+' h45 M'+(bx[i]!+133)+','+by(base)+' V'+by(av[i]!)+' M'+(bx[i]!+110)+','+by(av[i]!)+' h45'},duration:.65},T(0,f+.04))
    tl.to('.budget-gap-'+i,{autoAlpha:1,duration:.3},T(0,f+.075))
  })
  tl.to('.baseline-label,.baseline-guide',{autoAlpha:1,duration:.35},T(0,.46))
  tl.to('.budget-paper',{attr:{viewBox:'0 0 2510 1683'},duration:.7,ease:'power3.inOut'},T(0,.9))

  // The first mixed column is visible when it is named; its input recipe is assembled beside it before revealing its score.
  tl.to('.budget-stage',{autoAlpha:0,duration:.2},T(1,.005))
  tl.to('.mixed-stage',{autoAlpha:1,duration:.01},T(1,.005))
  gsap.set('.ratio-orange,.ratio-blue,.mix-model,.mix-model-label,.mix-flow',{autoAlpha:0})
  gsap.set('.mix-sample',{autoAlpha:0,y:-3})
  tl.to('.mix-evidence',{autoAlpha:1,duration:.01},T(1,.005))
  tl.to('.mix-caption',{autoAlpha:1,duration:.25},T(1,.01))
  tl.to('.mix-sample:not(.mix-sample-9)',{autoAlpha:1,y:0,duration:.35,stagger:.035,ease:'power2.out'},T(1,.035))
  tl.to('.mix-model,.mix-model-label',{autoAlpha:1,duration:.25},T(1,.12))
  gsap.set('.mix-bar-focus,.mix-reference,.mix-conclusion,.mix-ratio-note,.mix-score,.mix-rl,.sft-error,.rl-error,.error-caption,.error-axis',{autoAlpha:0})
  tl.to('.mix-paper',{attr:{viewBox:'570 135 1130 1260'},duration:.65,ease:'power3.inOut'},T(1,.17))
  tl.to('.mix-bar-focus',{autoAlpha:1,duration:.25},T(1,.1976))
  tl.to('.ratio-orange',{autoAlpha:1,duration:.25},T(1,.2597))
  tl.to('.mix-sample-9',{autoAlpha:1,y:0,duration:.35},T(1,.365))
  tl.to('.ratio-blue',{autoAlpha:1,duration:.25},T(1,.3857))
  tl.to('.mix-flow',{autoAlpha:1,duration:.01},T(1,.4))
  draw(ctx,tl,'.mix-flow',T(1,.4),.4)
  Array.from({length:10},(_,i)=>i).forEach(i=>tl.to('.mix-sample-'+i,{x:130-(111+i*4.1),y:24,scale:.7,transformOrigin:'50% 50%',duration:.45,ease:'power3.inOut'},T(1,.405)+i*.025))
  tl.to('.mix-process',{autoAlpha:0,duration:.2},T(1,.47))
  tl.to('.mix-paper-wash',{opacity:0,duration:.3},T(1,.48))
  tl.to('.mix-ratio-note',{autoAlpha:1,duration:.25},T(1,.48))
  tl.to('.mix-score',{autoAlpha:1,duration:.25},T(1,.5131))
  tl.to('.mix-reference,.mix-rl',{autoAlpha:1,duration:.25},T(1,.6214))
  tl.to('.sft-error,.rl-error,.error-caption,.error-axis',{autoAlpha:1,duration:.25,stagger:.06},T(1,.7236))
  tl.to('.error-caption',{autoAlpha:0,duration:.2},T(1,.83))
  tl.to('.mix-conclusion',{autoAlpha:1,duration:.25},T(1,.85))
  tl.to('.mix-paper',{attr:{viewBox:'0 0 2520 1532'},duration:.7,ease:'power3.inOut'},T(1,.9))
  return finish(ctx,tl)
})
