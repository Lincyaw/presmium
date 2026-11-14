import {gsapScene} from '@lincyaw/addon-motion/scene'
import {brand,clock,escape,frame,LAYER} from '../../../kit/frame.ts'
const blue='#356fba',red='#c45263',green='#249a88'
export default gsapScene(ctx=>{
 const {root,gsap,parameters:p}=ctx,{T}=clock(ctx.at,ctx.durations),tl=gsap.timeline(), l=(p.labels??[]) as string[],titles=(p.titles??[p.title]) as string[],m=String(p.mode)
 const tx=(s:string,x:number,y:number,n=3,c='var(--pm-color-ink)',cl='')=>'<text class="'+cl+'" x="'+x+'" y="'+y+'" font-size="'+n+'" style="fill:'+c+'" text-anchor="middle" font-weight="650">'+escape(s)+'</text>'
 const box=(x:number,y:number,w:number,h:number,c=blue,cl='')=>'<rect class="'+cl+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="1.5" fill="var(--pm-color-surface)" stroke="'+c+'" stroke-width=".4"/>'
 const line=(x:number,y:number,x2:number,y2:number,c=blue,cl='')=>'<path class="'+cl+'" d="M'+x+','+y+'L'+x2+','+y2+'" stroke="'+c+'" stroke-width=".5" fill="none"/>'
 let body=''
 if(m==='question'||m==='mechanism'){
  body=tx(l[0]??'',80,25,4)+[0,1].map(row=>'<g class="lane lane'+row+'">'+tx(l[1+row]??'',20,39+row*17,2.5,row?red:blue)+[0,1,2].map(i=>'<g class="step r'+row+'n'+i+'">'+box(46+i*35,30+row*17,29,13,row?red:blue)+tx(l[3+row*3+i]??'',60.5+i*35,38+row*17,2.8,row?red:blue)+'</g>').join('')+[0,1].map(i=>line(75+i*35,36.5+row*17,81+i*35,36.5+row*17,row?red:blue,'arrow r'+row+'a'+i)).join('')+'</g>').join('')
  if(m==='question')body+='<g class="beans">'+Array.from({length:12},(_,i)=>'<circle class="bean bean'+i+'" cx="'+(17+i*11)+'" cy="53" r="1.1" fill="'+blue+'"/>').join('')+'</g>'
  body+='<g class="gold">'+box(10,52,27,12,red)+tx(l[9]??'',23.5,59.5,3.5,red)+'</g>'+tx(l[10]??'',80,64,2.6,red,'insight')
 }else if(m==='experiment'){
  body=[0,1].map(i=>'<g class="row row'+i+'">'+box(9,27+i*25,34,15,i?red:blue)+tx(l[i]??'',26,36+i*25,2.8,i?red:blue)+line(43,34.5+i*25,69,34.5+i*25,i?red:blue)+box(69,26+i*25,25,17,green,'gate gate'+i)+tx(l[2]??'',81.5,36+i*25,2.6,green)+line(94,34.5+i*25,119,34.5+i*25,green,'out o'+i)+box(119,27+i*25,30,15,green,'student st'+i)+tx(l[3]??'',134,36+i*25,2.8,green,'student st'+i)+'<circle class="token t'+i+'" cx="46" cy="'+(34.5+i*25)+'" r="2" fill="'+(i?red:blue)+'"/>'+tx(l[4]??'',56,23+i*25,2.1,'var(--pm-color-muted)','pass p'+i)+'</g>').join('')
 }else if(m==='result'){
  const v=p.values as number[][]
  body=line(20,60,139,60,'var(--pm-color-ink)')+line(20,18,20,60,'var(--pm-color-ink)')+tx('0',15,61,2.2)+tx('100',13,20,2.2)+tx(l[0]??'',79,21,3)+[0,1].map(i=>'<rect class="bar bar'+i+'" x="'+(40+i*47)+'" y="60" width="23" height="0" fill="'+(i?red:blue)+'"/>'+tx(l[i+1]??'',51.5+i*47,65,2.6)+tx('0',71+i*47,29,3.5,i?red:blue,'value v'+i)).join('')+tx(l[3]??'',137,43,2.4,red,'gap-label')+tx('0',137,50,4.5,red,'gap')
 }else if(m==='ablation'){
  body=line(22,60,146,60,'var(--pm-color-ink)')+line(22,19,22,60,'var(--pm-color-ink)')+line(22,21.96,146,21.96,blue,'reference')+tx(l[0]??'',89,19,2.4,blue)+'<rect class="bar" x="31" y="60" width="19" height="0" fill="'+red+'"/>'+tx('0',57,28,4,red,'value')+l.slice(1,5).map((s,i)=>'<g class="prompt prompt'+i+'">'+box(62,35,86,17,i?green:red)+tx(s,105,45,3.1,i?green:red)+'</g>').join('')+tx(l[5]??'',85,64,2.8)
 }else if(m==='scope'){
  body=box(9,33,36,16,blue)+tx(l[0]??'',27,43,3)+line(45,41,75,29,blue)+line(45,41,75,58,blue)+box(75,21,72,16,red)+tx(l[1]??'',111,28,3,red)+tx(l[2]??'',111,34,2.3,red)+box(75,50,72,16,green)+tx(l[3]??'',111,57,3,green)+tx(l[4]??'',111,63,2.3,green)+'<circle class="pulse" cx="45" cy="41" r="2" fill="'+blue+'"/>'
 }else if(m==='original'){
  body='<div class="figure"><div class="camera"><img src="'+new URL('../figures/experiment.png',import.meta.url).href+'"></div></div><div class="key">'+escape(l[0]??'')+'</div>'
 }
 frame(root,'.heading{position:absolute;left:6cqw;top:10cqh;font-size:3.1cqw;font-weight:800}.source{position:absolute;left:6cqw;top:75cqh;font-size:1.1cqw;color:var(--pm-color-muted)}.figure{position:absolute;left:6cqw;top:22cqh;width:88cqw;height:40cqh;background:white;overflow:hidden}.camera{position:absolute;inset:0;transform-origin:0 0}.camera img{width:100%;height:100%;object-fit:contain}.key{position:absolute;left:6cqw;top:66cqh;font-size:2.1cqw;font-weight:700}',brand('Answer-conditioned CoT')+titles.map((s,i)=>'<div class="heading h'+i+'">'+escape(String(s))+'</div>').join('')+(m==='original'?body:'<svg class="layer" '+LAYER+'>'+body+'</svg>')+'<div class="source">'+escape(String(p.source??''))+'</div>')
 gsap.set('.heading',{autoAlpha:0});gsap.set('.h0',{autoAlpha:1})
 titles.slice(1).forEach((_,i)=>{tl.set('.h'+i,{autoAlpha:0},T(i+1,.004));tl.set('.h'+(i+1),{autoAlpha:1},T(i+1,.004))})
 if(m==='question'){
  gsap.set('.step,.arrow,.lane1,.gold,.insight',{autoAlpha:0})
  for(let i=0;i<12;i++)tl.to('.bean'+i,{attr:{cx:45+Math.floor(i/4)*36+(i%4)*4},duration:1.1,ease:'power2.inOut'},T(0,.16)+(i%4)*.08)
  tl.to('.beans',{autoAlpha:0,duration:.2},T(1,.02))
  for(let i=0;i<3;i++){tl.to('.r0n'+i,{autoAlpha:1,duration:.35},T(0,.15+i*.2));if(i<2)tl.to('.r0a'+i,{autoAlpha:1,duration:.3},T(0,.32+i*.2))}
  tl.to('.lane1,.gold',{autoAlpha:1,duration:.4},T(1,.12));tl.to('.gold',{attr:{transform:'translate(36 -2)'},duration:1.1,ease:'power2.inOut'},T(1,.23))
  tl.to('.gold',{autoAlpha:0,duration:.2},T(1,.43));tl.to('.r1n0',{autoAlpha:1,duration:.4},T(1,.39));tl.to('.r1n1,.r1n2,.r1a0,.r1a1',{autoAlpha:1,stagger:.16,duration:.4},T(1,.5));tl.set('.insight',{autoAlpha:0},T(1,.75))
 }else if(m==='mechanism'){
  gsap.set('.gold,.insight',{autoAlpha:0});gsap.set('.lane rect',{opacity:.5})
  tl.to('.r1n0 rect',{strokeWidth:1.3,opacity:1,duration:.5},T(0,.2));tl.to('.r0n2 rect',{strokeWidth:1.3,opacity:1,duration:.5},T(0,.4));tl.to('.insight',{autoAlpha:1,duration:.4},T(0,.65))
 }else if(m==='experiment'){
  gsap.set('.student,.out,.pass',{autoAlpha:0})
  for(let i=0;i<2;i++){tl.to('.t'+i,{attr:{cx:81.5},duration:1.3,ease:'power2.inOut'},T(0,.18+i*.13));tl.to('.p'+i,{autoAlpha:1,duration:.3},T(0,.42+i*.13));tl.to('.gate'+i,{fill:green,fillOpacity:.17,duration:.5},T(0,.44+i*.13));tl.to('.t'+i,{autoAlpha:0,duration:.15},T(0,.56+i*.13));tl.to('.o'+i+',.st'+i,{autoAlpha:1,duration:.4},T(1,.12+i*.13));tl.set('.t'+i,{autoAlpha:1},T(1,.22+i*.13));tl.to('.t'+i,{attr:{cx:134},duration:1.3,ease:'power2.inOut'},T(1,.22+i*.13));tl.to('.t'+i,{autoAlpha:0,duration:.15},T(1,.22+i*.13)+1.35)}
 }else if(m==='result'){
  const vals=p.values as number[][]
  gsap.set('.gap,.gap-label',{autoAlpha:0})
  vals.forEach((row,k)=>{row.slice(0,2).forEach((v,i)=>{tl.to('.bar'+i,{attr:{height:v*.40,y:60-v*.40},duration:1.2,ease:'power2.inOut'},T(k,.18+i*.18));tl.to('.v'+i,{textContent:v,duration:1.2,modifiers:{textContent:(x:string)=>(+x).toFixed(1)}},T(k,.18+i*.18))});tl.set('.gap,.gap-label',{autoAlpha:0},T(k,.005));tl.to('.gap',{textContent:row[2],autoAlpha:1,duration:.6,modifiers:{textContent:(x:string)=>(+x).toFixed(1)}},T(k,.65));tl.to('.gap-label',{autoAlpha:1,duration:.3},T(k,.65))})
 }else if(m==='ablation'){
  gsap.set('.prompt',{autoAlpha:0});const values=p.values as number[]
  values.forEach((v,i)=>{const t=T(0,.1+i*.18);if(i)tl.set('.prompt'+(i-1),{autoAlpha:0},t);tl.to('.prompt'+i,{autoAlpha:1,duration:.25},t);tl.to('.bar',{attr:{height:v*.40,y:60-v*.40},duration:.8},t);tl.to('.value',{textContent:v,duration:.8,modifiers:{textContent:(x:string)=>(+x).toFixed(1)}},t)})
 }else if(m==='scope'){
  gsap.set('rect:not(:first-child)',{opacity:.45})
  tl.to('.pulse',{attr:{cx:111,cy:29},duration:1.2,ease:'power2.inOut'},T(0,.2));tl.set('.pulse',{attr:{cx:45,cy:41}},T(0,.5));tl.to('.pulse',{attr:{cx:111,cy:58},duration:1.2,ease:'power2.inOut'},T(0,.55));tl.to('.pulse',{autoAlpha:0,duration:.15},T(0,.55)+1.3)
 }else if(m==='original'){
  tl.to('.camera',{scale:1.45,xPercent:-22,yPercent:2,duration:1.2,ease:'power2.inOut'},T(0,.15));tl.to('.camera',{scale:1.45,xPercent:-22,yPercent:-41,duration:1.3,ease:'power2.inOut'},T(0,.48));tl.to('.camera',{scale:1,xPercent:0,yPercent:0,duration:1},T(0,.77))
 }
 tl.set({}, {},ctx.total/1000);return tl
})
