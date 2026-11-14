import { gsapScene } from '@lincyaw/addon-motion/scene'
import { C, clock, draw, finish, headings, mount, path, rect, svg, tx } from './visual.ts'
import type { Shot } from './visual.ts'

// Every trial feeds a new collection into the same base-model slot. Results are
// left in place as prior observations; only the current input/result is active.
export default gsapScene(ctx => {
  const shots=ctx.parameters.frames as unknown as Shot[], s=shots[0]!, d=s.details??[], values=s.values??[]
  const {T}=clock(ctx.at,ctx.durations), {gsap}=ctx, tl=gsap.timeline()
  const mixes=Math.round((values[3]??70)/10), score=(i:number)=>values[i]??0
  const colors=[C.blue,C.orange,C.ink], names=[s.labels[0]??'',s.labels[1]??'',d[3]??'']
  const bag=(prefix:string,originY:number,orange:number)=>Array.from({length:10},(_,i)=>{
    const n=prefix==='mixed'&&i>=orange?i-orange:i, x=13+(n%5)*4.2, y=(prefix==='mixed'&&i>=orange?30:originY)+Math.floor(n/5)*6.2, c=i<orange?C.orange:C.blue
    return '<g class="input-token '+prefix+' token-'+prefix+'-'+i+'">'+rect(x,y,3.1,5.2,C.surface,'',c)+'<path d="M'+(x+.7)+','+(y+1.6)+' h1.7 m-1.7,1.5 h1.7" fill="none" stroke="'+c+'" stroke-width=".3"/></g>'
  }).join('')
  let art=tx(d[6]??'',26,19,2.0,C.muted)+'<g class="teacher teacher-blue">'+rect(7,22,38,21,C.surface,'',C.blue)+tx(s.labels[0]??'',26,28,2.6,C.blue)+'</g>'
  art+='<g class="teacher teacher-orange">'+rect(7,47,38,21,C.surface,'',C.orange)+tx(s.labels[1]??'',26,53,2.6,C.orange)+'</g>'
  art+='<g class="tray">'+rect(48,30,12,29,C.sunk)+tx(d[0]??'',54,26,2.5,C.muted)+'</g>'
  art+='<g class="model">'+rect(68,33,28,21)+tx(d[5]??'',82,41,4.3)+tx(d[1]??s.labels[2]??'',82,48,2.6,C.muted)+'</g>'
  art+=path(45,33,48,43,C.blue,'blue-feed')+path(45,58,48,46,C.orange,'orange-feed')+path(60,44,68,44,C.line,'model-feed')+path(96,44,107,44,C.line,'output-feed')
  art+='<g class="scores">'+tx(d[2]??'',131,23,2.7)+tx('0',108,66,2.1,C.muted)+tx('50',151,66,2.1,C.muted)+'<path d="M108,63 H151" stroke="'+C.line+'" stroke-width=".3" fill="none"/>'
  for(let i=0;i<3;i++){
    const y=31+i*11
    art+='<g class="result result-'+i+'">'+tx(names[i]!,108,y,2.2,colors[i],'start')+rect(108,y+2,0,4.4,colors[i],'score-bar bar-'+i,colors[i])+tx(score(i).toFixed(1),153,y+5.6,3.2,colors[i],'end','score-number number-'+i)+'</g>'
  }
  art+='</g>'+tx(d[4]??'',80,64,2.5,C.muted,'middle','matched')
  // Input papers sit above the tray and model sheets throughout their route.
  art+=bag('blue',30,0)+bag('orange',55,10)+bag('mixed',55,mixes)
  mount(ctx.root,shots,svg(art));headings(ctx,tl,shots,T)
  gsap.set('.input-token,.result,.output-feed,.matched',{autoAlpha:0})
  gsap.set('.teacher-orange',{opacity:.4})
  gsap.set('.score-number',{autoAlpha:0})
  draw(ctx,tl,'.blue-feed',T(0,.05),.45)
  draw(ctx,tl,'.orange-feed',T(0,.53),.45)
  draw(ctx,tl,'.model-feed',T(0,.16),.5)
  gsap.set('.output-feed',{autoAlpha:1})
  draw(ctx,tl,'.output-feed',T(0,.28),.5)
  tl.to('.matched',{autoAlpha:1,duration:.3},T(0,.02))
  const feed=(name:string,start:number,fromY:number) => {
    for(let i=0;i<10;i++){
      const n=name==='mixed'&&i>=mixes?i-mixes:i, x=13+(n%5)*4.2, y=(name==='mixed'&&i>=mixes?30:fromY)+Math.floor(n/5)*6.2, targetY=33+Math.floor(i/2)*4.6
      const at=start+i*.055
      tl.to('.token-'+name+'-'+i,{autoAlpha:1,duration:.08},at)
      tl.to('.token-'+name+'-'+i,{x:50+(i%2)*4-x,y:0,duration:.3,ease:'power2.out'},at)
      tl.to('.token-'+name+'-'+i,{y:targetY-y,duration:.25,ease:'power2.inOut'},at+.3)
      tl.to('.token-'+name+'-'+i,{x:70-x,y:42-y,scale:.6,transformOrigin:'50% 50%',duration:.55,ease:'power2.in'},at+.72)
      tl.to('.token-'+name+'-'+i,{autoAlpha:0,duration:.1},at+1.22)
    }
  }
  const result=(i:number,f:number) => {
    const at=T(0,f), w=43*score(i)/50
    tl.to('.result-'+i,{autoAlpha:1,duration:.2},at)
    tl.to('.bar-'+i,{attr:{width:w},duration:.8,ease:'power2.out'},at)
    tl.to('.number-'+i,{autoAlpha:1,duration:.2},at+.6)
  }
  feed('blue',T(0,.23),30); result(0,.44)
  tl.to('.model rect',{stroke:C.blue,duration:.25},T(0,.24))
  tl.to('.teacher-blue',{opacity:.4,duration:.3},T(0,.53))
  tl.to('.result-0',{opacity:.82,duration:.3},T(0,.53))
  tl.to('.teacher-orange',{opacity:1,duration:.3},T(0,.53))
  feed('orange',T(0,.57),55); result(1,.74)
  tl.to('.model rect',{stroke:C.orange,duration:.25},T(0,.61))
  tl.to('.result-1',{opacity:.82,duration:.3},T(0,.83))
  tl.to('.teacher-blue',{opacity:1,duration:.3},T(0,.83))
  feed('mixed',T(0,.84),55); result(2,.93)
  tl.to('.model rect',{stroke:C.ink,duration:.25},T(0,.89))
  tl.to('.result-0,.result-1',{opacity:.85,duration:.3},T(0,.97))
  return finish(ctx,tl)
})
