import {gsapScene}from '@lincyaw/addon-motion/scene'
import {box,C,finish,link,mount,start,svg,tx,wipe}from './visual.ts'
import type{Shot}from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!,b=shots[1]!;
 let art=box(10,22,83,42,'file')+tx(a.labels[0]!,14,20,2.5,C.muted)+tx(a.lines![0]!,19,30,3);
 art+='<g class="tail">'+a.lines!.slice(1).map((s,i)=>tx(s,19,38+i*6,3,i===2?C.red:C.ink)).join('')+'</g>';
 art+='<g class="plan">'+box(15,32,73,6,'',C.blue)+tx(a.labels[1]!,19,36.5,2.5,C.blue)+'</g>';
 art+='<g class="fix">'+box(15,57,73,7,'',C.green)+tx(b.labels[0]!,19,62,2.5,C.green)+'</g>';
 art+=box(15,46,72,7,'cursor',C.blue,'none');
 art+=tx(a.labels[2]!,104,29,3,C.blue,'start','tip1')+tx(b.labels[1]!,104,48,3,C.red,'start','tip2')+tx(b.labels[2]!,100,59,2.7,C.green,'start','tip2')+link(105,31,88,35,'p1')+link(104,58,88,60,'p2',C.green);
 mount(ctx,shots,svg(art));const tl=ctx.gsap.timeline(),T=start(ctx,tl,shots);
 ctx.gsap.set('.plan,.fix,.tip1,.tip2,.p1,.p2,.cursor',{autoAlpha:0});ctx.gsap.set('.plan',{attr:{transform:'translate(0 -2)'}});
 tl.to('.tip1',{autoAlpha:1,duration:.25},T(0,.1));tl.to('.tail',{attr:{transform:'translate(0 6)'},duration:.7,ease:'power3.inOut'},T(0,.28));
 tl.to('.plan',{autoAlpha:1,attr:{transform:'translate(0 0)'},duration:.8,ease:'power3.inOut'},T(0,.28));tl.set('.p1',{autoAlpha:1},T(0,.33));wipe(ctx,tl,'.p1',T(0,.33));
 tl.to('.tip1,.p1',{autoAlpha:0,duration:.2},T(1,.04));tl.to('.cursor',{autoAlpha:1,duration:.2},T(1,.18));
 tl.to('.cursor',{attr:{y:50},duration:.75,ease:'power2.inOut'},T(1,.28));tl.to('.tip2',{autoAlpha:1,duration:.3},T(1,.35));
 tl.fromTo('.fix',{autoAlpha:0,attr:{transform:'translate(0 -1)'}},{autoAlpha:1,attr:{transform:'translate(0 0)'},duration:.8,ease:'power3.inOut',immediateRender:false},T(1,.56));
 tl.set('.p2',{autoAlpha:1},T(1,.58));wipe(ctx,tl,'.p2',T(1,.58));tl.to('.cursor',{autoAlpha:0,duration:.2},T(1,.75));return finish(ctx,tl)
})
