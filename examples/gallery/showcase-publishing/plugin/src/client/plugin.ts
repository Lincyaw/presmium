class FeatureCounter extends HTMLElement {
 connectedCallback(){if(this.firstChild)return;let count=Number(this.getAttribute('start')??0);const button=document.createElement('button');button.type='button';button.className='pm-ui-button';const output=document.createElement('output');const label=this.getAttribute('label')??'Counter';button.append(label+(document.documentElement.lang.startsWith('zh')?'：':': '),output);const update=()=>{output.textContent=String(count)};button.addEventListener('click',()=>{count++;update()});update();this.append(button)}
}
export default {manifest:{id:'example.elements',version:'0.1.0',kernel:'^1.0.0'},restartable:true,setup(){if(!customElements.get('presmium-feature-counter'))customElements.define('presmium-feature-counter',FeatureCounter)}}
