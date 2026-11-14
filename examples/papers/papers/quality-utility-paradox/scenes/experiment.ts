import {gsapScene} from '@lincyaw/addon-motion/scene'
import original from '../figures/mismatch.png'
import {C,clock,node,edge,tx,box,mount,headers,draw,finish} from './visual.ts'
import type {Shot} from './visual.ts'
export default gsapScene(ctx=>{
 const shots=ctx.parameters.frames as unknown as Shot[],a=shots[0]!.labels,b=shots[1]!.labels,{T}=clock(ctx.at,ctx.durations),{gsap}=ctx
 const pipeline=node(24,42,'Q',a[0]!,'questions',C.ink)+box(56,22,43,16,'native-box',C.red)+tx(a[1]!,77.5,32,3,C.red,'native-label')+box(56,49,43,16,'refined-box',C.orange)+tx(a[2]!,77.5,59,3,C.orange,'refined-label')+
 edge('M35,42 C44,42 44,30 56,30','route route-native',C.red)+edge('M77.5,38 V49','route route-refined',C.orange)+
 tx(a[3]!,127,25,2.8,C.muted,'reward-label')+edge('M127,62 V31','reward-axis',C.muted)+
 '<circle class="reward-native" cx="127" cy="56" r="2" fill="'+C.red+'"/><circle class="reward-refined" cx="127" cy="56" r="2" fill="'+C.orange+'"/>'+
 tx(a[4]!,143,57,3.7,C.red,'reward-native-read')+tx(a[5]!,143,36,3.7,C.orange,'reward-refined-read')+tx(a[6]!,80,69,2.3,C.muted,'same-set')
 const plot='<image href="'+original+'" x="5" y="19" width="88" height="47.67"/><rect class="plot-wash" x="5" y="19" width="88" height="47.67" fill="#fff" opacity=".6"/>'+
 box(10,59,81,7,'x-axis',C.green,'none')+box(5,23,7,36,'y-axis',C.green,'none')+
 '<circle class="plot-focus" cx="24.4" cy="41.8" r="3.7" fill="none" stroke="'+C.red+'" stroke-width=".65"/>'+
 edge('M24.4,41.8 L58.9,48.6','reversal',C.orange)+tx(b[0]!,124,25,2.8,C.red,'native-result')+tx(b[1]!,124,34,5.6,C.red,'native-result')+
 tx(b[2]!,124,47,2.8,C.orange,'refined-result')+tx(b[3]!,124,56,5.6,C.orange,'refined-result')+tx(b[4]!,124,66,2.6,C.ink,'condition')
 mount(ctx,shots,'<g class="pipeline">'+pipeline+'</g><g class="plot">'+plot+'</g>')
 const tl=gsap.timeline();headers(ctx,tl,shots,T)
 gsap.set('.native-box,.native-label,.refined-box,.refined-label,.route,.reward-label,.reward-axis,.reward-native,.reward-refined,.reward-native-read,.reward-refined-read,.same-set,.plot,.x-axis,.y-axis,.plot-focus,.native-result,.refined-result,.condition,.reversal',{autoAlpha:0})
 tl.to('.questions',{autoAlpha:1,duration:.3},T(0,.12));tl.to('.native-box,.native-label',{autoAlpha:1,duration:.3},T(0,.3));tl.to('.route-native',{autoAlpha:1,duration:.01},T(0,.31));draw(ctx,tl,'.route-native',T(0,.31),.7)
 tl.to('.refined-box,.refined-label',{autoAlpha:1,duration:.3},T(0,.55));tl.to('.route-refined',{autoAlpha:1,duration:.01},T(0,.55));draw(ctx,tl,'.route-refined',T(0,.55),.7)
 tl.to('.reward-label,.reward-axis,.reward-native,.reward-native-read',{autoAlpha:1,duration:.3},T(0,.65));tl.to('.reward-refined',{autoAlpha:1,duration:.01},T(0,.72));tl.to('.reward-refined',{attr:{cy:35},duration:.85,ease:'power3.inOut'},T(0,.72));tl.to('.reward-refined-read,.same-set',{autoAlpha:1,duration:.3},T(0,.79))
 tl.to('.pipeline',{autoAlpha:0,duration:.35},T(1,.04));tl.to('.plot',{autoAlpha:1,duration:.35},T(1,.04))
 tl.to('.x-axis',{autoAlpha:1,duration:.25},T(1,.15));tl.to('.x-axis',{autoAlpha:0,duration:.25},T(1,.27));tl.to('.y-axis',{autoAlpha:1,duration:.25},T(1,.27));tl.to('.y-axis',{autoAlpha:0,duration:.25},T(1,.4))
 tl.to('.plot-wash',{opacity:0,duration:.4},T(1,.41));tl.to('.plot-focus,.native-result',{autoAlpha:1,duration:.3},T(1,.46))
 tl.to('.plot-focus',{attr:{cx:58.9,cy:48.6,stroke:C.orange},duration:.85,ease:'power3.inOut'},T(1,.62));tl.to('.reversal',{autoAlpha:1,duration:.01},T(1,.62));draw(ctx,tl,'.reversal',T(1,.62),.85)
 tl.to('.refined-result',{autoAlpha:1,duration:.3},T(1,.76));tl.to('.condition',{autoAlpha:1,duration:.3},T(1,.84))
 return finish(ctx,tl)
})
