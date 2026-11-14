import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, clock, escape, frame, LAYER } from '../../../kit/frame.ts'
import { view } from '../../../kit/figure.ts'
const blue='#356fba', red='#c45263', green='#249a88'
export default gsapScene(ctx=>{
 const {root,gsap,parameters:p}=ctx, {T}=clock(ctx.at,ctx.durations), tl=gsap.timeline()
 const labels=(p.labels??[]) as string[], titles=(p.titles??[p.title]) as string[]
 const text=(s:string,x:number,y:number,n=3,c='var(--pm-color-ink)',cl='')=>'<text class="'+cl+'" x="'+x+'" y="'+y+'" font-size="'+n+'" text-anchor="middle" style="fill:'+c+'" font-weight="650">'+escape(s)+'</text>'
 const box=(x:number,y:number,w:number,h:number,c=blue,cl='')=>'<rect class="'+cl+'" x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="1.5" fill="var(--pm-color-surface)" stroke="'+c+'" stroke-width=".4"/>'
 const link=(x:number,y:number,x2:number,y2:number,cl='')=>'<path class="'+cl+'" d="M'+x+','+y+' L'+x2+','+y2+'" stroke="'+blue+'" stroke-width=".5" fill="none"/>'
 let body='', mode=String(p.mode)
 if(mode==='trace'||mode==='edit'){
  const eq=labels.slice(0,4)
  body=eq.map((s,i)=>'<g class="node n'+i+'">'+box(11+i*37,29,28,13)+text(s,25+i*37,37,3.5)+'</g>').join('')
  body+=Array.from({length:3},(_,i)=>link(39+i*37,35.5,48+i*37,35.5,'edge e'+i)).join('')
  body+='<g class="extra">'+box(49,51,60,10,red)+text(labels[4]??'',79,57.5,2.8,red)+link(62,42,62,51)+'</g>'
  body+='<g class="surface">'+text(labels[5]??'',80,23,2.8,red)+'</g>'
  body+='<g class="fusion">'+box(44,29,69,13,green)+text(labels[6]??'',81.5,37,3.6,green)+'</g>'
  body+='<g class="template">'+box(40,47,80,9,red)+text(labels[8]??'',80,53,3.2,red)+'</g>'
  body+='<g class="substitute">'+box(47,58,66,8,green)+text(labels[12]??'',80,63.5,3.3,green)+'</g>'
  body+=labels.slice(9,12).map((v,i)=>'<g class="mapping map'+i+'">'+text(v,50+i*30,24,2.7,red)+'</g>').join('')
  body+='<g class="ruler">'+link(12,65,150,65)+text(labels[8]??'',80,64,2.5)+'</g>'
 } else if(mode==='controls'){
  body=labels.slice(0,3).map((s,i)=>'<g class="control c'+i+'">'+text(s,32+i*48,29,3.3)+link(15+i*48,42,49+i*48,42,'rail')+'<circle class="knob k'+i+'" cx="'+(17+i*48)+'" cy="42" r="2.1" fill="'+[blue,red,green][i]+'"/>'+text(labels[i+3]??'',32+i*48,58,2.8)+'</g>').join('')
 } else if(mode==='figure'){
  const img=String(p.figure)==='efficiency' ? new URL('../figures/efficiency.png',import.meta.url).href:new URL('../figures/structure.png',import.meta.url).href
  body='<div class="legend">'+(String(p.figure)==='efficiency'?'':(p.legend as string[]??[]).map((v,i)=>'<div><i style="background:'+['#356fba','#209bc0','#48b5c4','#88cfc1'][i]+'"></i>'+escape(v)+'</div>').join(''))+'</div><div class="window"><div class="camera"><img src="'+img+'"></div><div class="panel-focus"></div></div><div class="fig-label">'+escape(labels[0]??'')+'</div><div class="key key0">'+escape(labels[1]??'')+'</div><div class="key key1">'+escape(labels[2]??'')+'</div>'
 } else if(mode==='transfer'){
  body=text(labels[0]??'',34,25,3.2)+text(labels[1]??'',125,25,3.2)+box(12,33,60,12,blue,'train')+text(labels[2]??'',42,41,3,blue,'train-text')+box(94,33,60,12,red,'infer')+text(labels[3]??'',124,41,3,red)+box(72,50,20,13,green,'student')+text(labels[4]??'',82,58,2.8,green,'student')+link(43,46,72,55,'flow1')+link(92,55,125,46,'flow2')+text(labels[5]??'',80,64,3,red,'conclusion')
 }
 const isFig=mode==='figure', isEfficiency=String(p.figure)==='efficiency'
 const figCss=isFig&&isEfficiency?'.window{left:7cqw;top:20cqh;width:58cqw;height:51cqh}.fig-label{left:68cqw;top:23cqh;width:27cqw;line-height:1.5}.key{left:68cqw;top:44cqh;width:27cqw;font-size:2cqw;line-height:1.5}':isFig&&!isEfficiency?'.window{left:5cqw;top:27cqh;width:90cqw;height:39cqh}.camera{width:100%;height:100%}.camera img{object-fit:contain}.fig-label{left:6cqw;top:71cqh;width:90cqw;font-size:1.1cqw;line-height:1.5}.legend{position:absolute;left:6cqw;top:18cqh;width:88cqw;display:grid;grid-template-columns:1fr 1fr;font-size:1.4cqw;line-height:1.65}.legend i{display:inline-block;width:1.8cqw;height:1.1cqw;margin-right:.6cqw}.key{left:6cqw;top:66.5cqh;width:88cqw;font-size:1.8cqw;line-height:1.5}.panel-focus{position:absolute;left:13.6%;top:0;width:16.3%;height:88%;border:.24cqw solid var(--pm-color-accent);border-radius:.5cqw}':''
 frame(root,'.heading{position:absolute;left:6cqw;top:10cqh;font-size:3.2cqw;font-weight:800}.source{position:absolute;left:6cqw;top:75cqh;font-size:1.1cqw;color:var(--pm-color-muted)}.window{position:absolute;left:7cqw;top:23cqh;width:86cqw;height:41cqh;overflow:hidden;background:white;border-radius:1cqw}.camera{position:absolute;inset:0;transform-origin:0 0}.camera img{width:100%;height:100%;object-fit:contain}.fig-label{position:absolute;left:7cqw;top:18cqh;font-size:1.5cqw}.key{position:absolute;left:7cqw;top:67cqh;font-size:2.1cqw;font-weight:750}'+figCss,brand(String(p.paper))+titles.map((s,i)=>'<div class="heading h'+i+'">'+escape(String(s))+'</div>').join('')+(isFig?body:'<svg class="layer" '+LAYER+'>'+body+'</svg>')+'<div class="source">'+escape(String(p.source??''))+'</div>')
 gsap.set('.heading',{autoAlpha:0});gsap.set('.h0',{autoAlpha:1})
 titles.slice(1).forEach((_,i)=>{tl.set('.h'+i,{autoAlpha:0},T(i+1,.004));tl.set('.h'+(i+1),{autoAlpha:1},T(i+1,.004))})
 if(mode==='trace'){
  gsap.set('.node,.edge,.extra,.ruler,.surface,.fusion,.template,.substitute,.mapping',{autoAlpha:0});gsap.set('.n0',{autoAlpha:1})
  labels.slice(0,4).forEach((_,i)=>tl.to('.n'+i,{autoAlpha:1,duration:.35},T(0,.12+i*.14)))
  tl.to('.edge',{autoAlpha:1,stagger:.18,duration:.3},T(0,.28))
  tl.to('.extra',{autoAlpha:1,duration:.4},T(1,.15));tl.to('.ruler',{autoAlpha:1,duration:.4},T(1,.55))
 } else if(mode==='edit'){
  gsap.set('.extra,.fusion,.template,.substitute,.mapping,.ruler',{autoAlpha:0})
  tl.to('.surface',{autoAlpha:.15,duration:.7},T(0,.35));tl.to('.node rect',{width:24,duration:.8},T(0,.35))
  tl.to('.extra',{autoAlpha:1,duration:.4},T(1,.10));tl.to('.extra',{y:10,autoAlpha:0,duration:1},T(1,.45))
  tl.to('.n1',{x:20,duration:.8},T(2,.20));tl.to('.n2',{x:-18,duration:.8},T(2,.20))
  tl.to('.n1,.n2,.e1',{autoAlpha:0,duration:.4},T(2,.44));tl.to('.fusion',{autoAlpha:1,duration:.6},T(2,.45))
  tl.to('.node,.edge',{x:0,y:-6,autoAlpha:.45,duration:.8},T(3,.15));tl.to('.fusion',{autoAlpha:0,duration:.4},T(3,.15));tl.to('.template',{autoAlpha:1,duration:.6},T(3,.25));tl.to('.mapping',{autoAlpha:1,duration:.3},T(3,.3));tl.to('.mapping',{attr:{transform:'translate(0 18)'},duration:1.1,ease:'power2.inOut',stagger:.12},T(3,.34));tl.to('.substitute',{autoAlpha:1,duration:.5},T(3,.65))
 } else if(mode==='controls'){
  gsap.set('.control',{autoAlpha:0});gsap.set('.c0',{autoAlpha:1});labels.slice(0,3).forEach((_,i)=>{tl.to('.c'+i,{autoAlpha:1,duration:.4},T(0,.1+i*.2));tl.to('.k'+i,{attr:{cx:43+i*48},duration:1.2,ease:'power2.inOut'},T(0,.15+i*.2))})
 } else if(mode==='figure'){
  gsap.set('.key',{autoAlpha:0})
  if(String(p.figure)==='efficiency'){tl.to('.key0',{autoAlpha:1,duration:.5},T(0,.55))}
  else{
   tl.to('.panel-focus',{left:'51.1%',duration:1.1,ease:'power2.inOut'},T(0,.48));tl.to('.key0',{autoAlpha:1,duration:.4},T(0,.63))
   tl.to('.key0',{autoAlpha:0,duration:.2},T(1));tl.to('.panel-focus',{left:'32.4%',duration:1.1,ease:'power2.inOut'},T(1,.15));tl.to('.panel-focus',{left:'69.75%',duration:1.1,ease:'power2.inOut'},T(1,.50));tl.to('.key1',{autoAlpha:1,duration:.4},T(1,.62))
  }
 } else if(mode==='transfer'){
  gsap.set('.student,.flow1,.flow2,.conclusion',{autoAlpha:0})
  tl.to('.train',{width:25,duration:1.5,ease:'power2.inOut'},T(0,.15));tl.to('.train-text',{x:-18,duration:1.5},T(0,.15))
  tl.to('.student,.flow1',{autoAlpha:1,duration:.5},T(0,.4));tl.to('.flow2',{autoAlpha:1,duration:.5},T(0,.56));tl.to('.conclusion',{autoAlpha:1,duration:.4},T(0,.72))
 }
 tl.set({}, {},ctx.total/1000);return tl
})
