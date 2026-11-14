import{gsapScene}from '@lincyaw/addon-motion/scene'
import{box,C,finish,link,mount,start,svg,tx,wipe}from './visual.ts'
import type{Shot}from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!,b=shots[1]!;
 let art=tx(a.labels[0]!,13,23,2.8,C.green);
 [0,1].forEach(i=>{const s=i?b:a,y=29+i*23;art+='<g class="lane lane'+i+'">'+box(11,y,41,14,'',i?C.red:C.blue)+tx(s.labels[1]!,31.5,y+6,2.6,i?C.red:C.blue,'middle')+tx(s.labels[2]!,31.5,y+11,2.2,C.muted,'middle')+box(73,y,30,14,'',C.line)+tx(s.labels[3]!,88,y+8.5,3,C.ink,'middle')+box(121,y,28,14,'result result'+i,C.green)+tx(s.labels[4]!,135,y+8.5,2.5,C.green,'middle','result result'+i)+link(52,y+7,73,y+7,'flow f'+i)+link(103,y+7,121,y+7,'back b'+i,C.green)+'</g>'});
 art+=box(57,20,24,6,'evidence',C.green)+tx(a.details![0]!,69,24.5,2.2,C.green,'middle','evidence')+link(81,23,88,29,'evlink',C.green);
 art+='<g class="gold">'+box(55,45,38,5,'',C.red)+tx(b.details![0]!,74,48.6,2.2,C.red,'middle')+link(88,50,88,52,'',C.red)+'</g>';
 mount(ctx,shots,svg(art),'.src{top:19cqh}');const tl=ctx.gsap.timeline(),T=start(ctx,tl,shots);ctx.gsap.set('.lane1,.result,.flow,.back,.evlink,.evidence,.gold',{autoAlpha:0});
 tl.set('.f0',{autoAlpha:1},T(0,.16));wipe(ctx,tl,'.f0',T(0,.16));tl.to('.evidence',{autoAlpha:1,duration:.2},T(0,.36));tl.set('.evlink',{autoAlpha:1},T(0,.4));wipe(ctx,tl,'.evlink',T(0,.4));
 tl.set('.b0',{autoAlpha:1},T(0,.58));wipe(ctx,tl,'.b0',T(0,.58));tl.to('.result0',{autoAlpha:1,duration:.35},T(0,.66));
 tl.to('.lane1',{autoAlpha:1,duration:.3},T(1,.1));tl.set('.f1',{autoAlpha:1},T(1,.22));wipe(ctx,tl,'.f1',T(1,.22));tl.to('.gold',{autoAlpha:1,duration:.35},T(1,.4));
 tl.set('.b1',{autoAlpha:1},T(1,.62));wipe(ctx,tl,'.b1',T(1,.62));tl.to('.result1',{autoAlpha:1,duration:.35},T(1,.7));return finish(ctx,tl)
})
