import{gsapScene}from '@lincyaw/addon-motion/scene'
import{box,C,finish,link,mount,start,svg,tx,wipe}from './visual.ts'
import type{Shot}from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!,b=shots[1]!;
 let art=tx(a.labels[0]!,12,23,2.8,C.muted)+box(94,28,57,34,'draft',C.blue)+tx(a.labels[1]!,98,34,2.7,C.blue);
 [0,1].forEach(i=>{const y=33+i*22;[0,1,2].forEach(j=>art+=box(10+j*25,y-5,22,9,'fact fact'+i+'-'+j,C.green)+tx(a.lines![i*3+j]!,21+j*25,y+1,2.5,C.green,'middle','fact fact'+i+'-'+j));art+=link(32,y,35,y,'factlink fl'+i+'-0',C.green)+link(57,y,60,y,'factlink fl'+i+'-1',C.green)});
 art+=tx(a.details![0]!,99,42,2.6,C.ink,'start','draftline')+tx(a.details![1]!,99,56,3,C.blue,'start','answer')+box(98,45,46,6,'blank',C.red,'none');
 art+='<g class="bridge">'+tx(b.labels[0]!,100,49.5,2.6,C.green)+link(82,33,98,47,'',C.green)+link(82,55,98,50,'',C.green)+'</g>'+tx(b.labels[1]!,98,65,2.6,C.green,'start','bridge');
 mount(ctx,shots,svg(art));const tl=ctx.gsap.timeline(),T=start(ctx,tl,shots);ctx.gsap.set('.fact,.factlink,.draftline,.answer,.blank,.bridge',{autoAlpha:0});
 [0,1,2].forEach(j=>{tl.to('.fact0-'+j+',.fact1-'+j,{autoAlpha:1,duration:.35},T(0,.1+j*.12));if(j<2){tl.set('.fl0-'+j+',.fl1-'+j,{autoAlpha:1},T(0,.18+j*.12));wipe(ctx,tl,'.fl0-'+j+',.fl1-'+j,T(0,.18+j*.12))}});
 tl.to('.draftline',{autoAlpha:1,duration:.3},T(0,.5));tl.to('.answer,.blank',{autoAlpha:1,duration:.3},T(0,.69));
 tl.to('.blank',{autoAlpha:0,duration:.2},T(1,.26));tl.fromTo('.bridge',{autoAlpha:0,x:-20},{autoAlpha:1,x:0,duration:.8,immediateRender:false,ease:'power3.inOut'},T(1,.31));return finish(ctx,tl)
})
