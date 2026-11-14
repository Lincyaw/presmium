import{gsapScene}from '@lincyaw/addon-motion/scene'
import{box,C,finish,link,mount,start,svg,tx,wipe}from './visual.ts'
import type{Shot}from './visual.ts'
import{FIGURE_CSS,figureHtml,view}from '../../../kit/figure.ts'
import map from '../figures/editing.json'
const img=new URL('../figures/editing.png',import.meta.url).href
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!,b=shots[1]!;
 let art='<g class="workflow">'+box(12,25,67,44)+tx(a.labels[0]!,17,32,3);
 art+=a.lines!.map((s,i)=>tx(s,18,44+i*9,2.4,C.muted)).join('');
 [0,1,2].forEach((i)=>{art+='<g class="ins ins'+i+'">'+box(18,37+i*9,56,5,'',C.blue)+tx(a.labels[i+1]!,20,40.6+i*9,2.2,C.blue)+'</g>';art+='<g class="commit c'+i+'"><circle cx="105" cy="'+(33+i*12)+'" r="1.1" fill="'+C.blue+'"/>'+tx(a.details![i]!,110,34+i*12,2.7)+'</g>';art+=link(80,40+i*9,103,33+i*12,'edge e'+i)});
 art+='<path d="M105,32 V58" stroke="'+C.blue+'" stroke-width=".5"/></g>';
 const overlay='<div class="pfig-ring ring" style="left:12%;top:10%;width:14%;height:75%"></div>';
 mount(ctx,shots,svg(art)+figureHtml('original',img,map as any,{x:10,y:23,w:80},overlay)+'<div class="flabel">'+b.labels[0]+'</div>',FIGURE_CSS+'.src0{top:21cqh}.src1{top:71cqh}.flabel{position:absolute;left:6cqw;top:19cqh;font-size:2.1cqw;font-weight:700}');
 const tl=ctx.gsap.timeline(),T=start(ctx,tl,shots);ctx.gsap.set('.ins,.commit,.edge,.original,.flabel',{autoAlpha:0});
 [0,1,2].forEach(i=>{tl.to('.ins'+i,{autoAlpha:1,duration:.3},T(0,.16+i*.2));tl.set('.e'+i,{autoAlpha:1},T(0,.22+i*.2));wipe(ctx,tl,'.e'+i,T(0,.22+i*.2));tl.to('.c'+i,{autoAlpha:1,duration:.3},T(0,.28+i*.2))});
 tl.to('.original',{autoAlpha:1,duration:.25},T(1));tl.to('.workflow',{autoAlpha:0,duration:.2},T(1)+.25);
 tl.to('.ring',{left:'12%',width:'14%',duration:.4},T(1,.18));tl.to('.ring',{left:'37%',width:'28%',duration:.8},T(1,.5));tl.to('.flabel',{autoAlpha:1,duration:.3},T(1,.7));return finish(ctx,tl)
})
