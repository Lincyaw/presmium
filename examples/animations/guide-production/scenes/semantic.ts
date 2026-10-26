import { defineScene } from '@lincyaw/addon-motion/scene'
export default defineScene(ctx => {
 const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 640 260');svg.setAttribute('width','100%');svg.setAttribute('height','100%');svg.setAttribute('aria-label','按步骤参数变化的柱状示意');
 const title=document.createElementNS(svg.namespaceURI,'text');title.setAttribute('x','32');title.setAttribute('y','48');title.setAttribute('fill',ctx.color('ink'));title.setAttribute('font-size','24');
 const bar=document.createElementNS(svg.namespaceURI,'rect');bar.setAttribute('x','32');bar.setAttribute('y','100');bar.setAttribute('height','70');bar.setAttribute('rx','8');bar.setAttribute('fill',ctx.color('accent'));svg.append(title,bar);ctx.root.append(svg);
 return {seek(ms){const value=Number(ctx.parameters.value??0);bar.setAttribute('width',String(value*5.5));title.textContent=String(ctx.state)+' · value='+value;svg.dataset.featureState=String(ctx.state);svg.dataset.featureValue=String(value);svg.dataset.featureTime=String(ms)},dispose(){svg.remove()}}
})
