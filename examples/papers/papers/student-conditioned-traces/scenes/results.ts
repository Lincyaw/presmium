import{gsapScene}from '@lincyaw/addon-motion/scene'
import{box,C,finish,mount,start,svg,tx}from './visual.ts'
import type{Shot}from './visual.ts'
import{FIGURE_CSS,figureHtml}from '../../../kit/figure.ts'
import map from '../figures/results.json'
const img=new URL('../figures/results.png',import.meta.url).href
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!,b=shots[1]!;
 const mark='<div class="pfig-ring ring" style="left:12.8%;top:0;width:25.3%;height:100%"></div>';
 let art='<g class="compare">'+tx(b.labels[0]!,37,24,2.8,C.muted)+tx(b.labels[1]!,100,24,2.8,C.muted);
 const cs=['#b8bec9','#505b6a','#7196b6','#147f7f'];
 [0,1,2,3].forEach(i=>{const y=29+i*8;art+=tx(b.details![i]!,33,y+4,2.3,C.ink,'end');[0,1].forEach(j=>{const v=b.values![i+j*4]!,x=38+j*62;art+='<rect class="bar bar'+j+'-'+i+'" x="'+x+'" y="'+y+'" width="'+v*.52+'" height="5" rx=".6" fill="'+cs[i]+'"/>'+tx(v.toFixed(1),x+v*.52+1,y+4,2.5,cs[i],'start','v v'+j+'-'+i)})});
 art+=tx(b.labels[2]!,38,62,2.5,C.green,'start','conclusion')+'</g>';
 mount(ctx,shots,figureHtml('original',img,map as any,{x:5,y:27,w:90},mark)+svg(art),FIGURE_CSS);const tl=ctx.gsap.timeline(),T=start(ctx,tl,shots);ctx.gsap.set('.compare,.v,.conclusion',{autoAlpha:0});ctx.gsap.set('.bar',{scaleX:0,transformOrigin:'0% 50%'});
 tl.to('.ring',{left:'42.4%',width:'27.5%',duration:.9,ease:'power2.inOut'},T(0,.53));
 tl.to('.compare',{autoAlpha:1,duration:.25},T(1));tl.to('.original',{autoAlpha:0,duration:.2},T(1)+.25);
 [0,1,2,3].forEach(i=>[0,1].forEach(j=>{tl.to('.bar'+j+'-'+i,{scaleX:1,duration:.65,ease:'power3.inOut'},T(1,.035+i*.16));tl.to('.v'+j+'-'+i,{autoAlpha:1,duration:.2},T(1,.035+i*.16)+.65)}));
 tl.to('.conclusion',{autoAlpha:1,duration:.3},T(1,.84));return finish(ctx,tl)
})
