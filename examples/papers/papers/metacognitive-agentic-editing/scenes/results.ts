import{gsapScene}from '@lincyaw/addon-motion/scene'
import{box,C,finish,mount,start,svg,tx}from './visual.ts'
import type{Shot}from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!,b=shots[1]!;
 const colors=[C.muted,C.muted,C.red,C.blue],base=36,w=105;
 let art='<g class="math">'+tx(a.labels[0]!,36,26,2.3,C.muted);
 [0,50,100].forEach(v=>{art+='<path d="M'+(base+w*v/100)+',29 V64" stroke="'+C.line+'" stroke-width=".2"/>'+tx(String(v),base+w*v/100,65,2,C.muted,'middle')});
 a.values!.forEach((v,i)=>{art+=tx(a.labels![i+1]!,32,35+i*8,2.6,C.ink,'end')+'<rect class="bar b'+i+'" x="'+base+'" y="'+(31+i*8)+'" width="'+w*v/100+'" height="5" rx=".6" fill="'+colors[i]+'"/>'+tx(v.toFixed(1),base+w*v/100+1.3,35+i*8,2.4,colors[i],'start','val v'+i)});
 art+=tx(a.details![0]!,92,23,2.5,C.blue,'middle','delta')+'</g>';
 art+='<g class="transfer">'+tx(b.labels[0]!,12,29,3)+tx(b.labels[1]!,12,38,2.5,C.muted);
 b.values!.forEach((v,i)=>{art+=tx(b.labels[i+2]!,40,49+i*13,2.7,C.ink,'end')+'<rect class="tb tb'+i+'" x="45" y="'+(44+i*13)+'" width="'+(v*.9)+'" height="7" rx="1" fill="'+(i?C.blue:C.muted)+'"/>'+tx(v.toFixed(1)+'%',47+v*.9,49+i*13,3,i?C.blue:C.muted,'start','tv tv'+i)});
 art+='</g>';
 mount(ctx,shots,svg(art),'.src{top:19cqh}');const tl=ctx.gsap.timeline(),T=start(ctx,tl,shots);ctx.gsap.set('.bar,.tb',{scaleX:0,transformOrigin:'0% 50%'});ctx.gsap.set('.val,.delta,.transfer,.tv',{autoAlpha:0});
 [0,1,2,3].forEach(i=>{tl.to('.b'+i,{scaleX:1,duration:.7,ease:'power3.inOut'},T(0,.13+i*.16));tl.to('.v'+i,{autoAlpha:1,duration:.2},T(0,.13+i*.16)+.7)});tl.to('.delta',{autoAlpha:1,duration:.3},T(0,.79));
 tl.to('.transfer',{autoAlpha:1,duration:.25},T(1));tl.to('.math',{autoAlpha:0,duration:.2},T(1)+.25);[0,1].forEach(i=>{tl.to('.tb'+i,{scaleX:1,duration:.9,ease:'power3.inOut'},T(1,.025+i*.3));tl.to('.tv'+i,{autoAlpha:1,duration:.2},T(1,.025+i*.3)+.9)});return finish(ctx,tl)
})
