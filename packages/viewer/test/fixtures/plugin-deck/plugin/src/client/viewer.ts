import { createElement as h } from 'react'
import { useStore } from '@lincyaw/host'
import type { CodeNode, IRBlock, IRSection } from '@lincyaw/kernel'
import type { ViewerPlugin } from '@lincyaw/viewer'
const plugin: ViewerPlugin = ({registerView,registerNodeRenderer,useViewer}) => {
 registerView({id:'cards',label:'卡片',kind:'page',component: function Cards({sections}:{sections:IRSection[]}){const viewer=useViewer();const position=useStore(viewer.position);return h('div',{className:'pm-view pm-cards'},sections.map(section=>h('article',{key:section.id,className:'pm-card','data-section':section.id,'aria-current':position.section===section.id?'true':undefined},h('h2',{},section.title),h('p',{},`${section.blocks.length} 块，${section.steps} 步`))))}})
 registerNodeRenderer('code:csv',function Csv({block}:{block:IRBlock}){const rows=(block.node as CodeNode).value.trim().split('\n').map(line=>line.split(','));return h('table',{className:'pm-csv'},h('tbody',{},rows.map((row,i)=>h('tr',{key:i},row.map((cell,j)=>h('td',{key:j},cell))))))})
 registerNodeRenderer('PmSwap',function Swap(){return h('p',{className:'pm-swapped'},'插件的渲染器')})
}
export default plugin
