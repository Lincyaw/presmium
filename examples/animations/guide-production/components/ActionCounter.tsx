import {useActions,useMessages} from '@lincyaw/host'
import {useRef,useState} from 'react'
import './ActionCounter.css'
export default function ActionCounter({label,targetId='feature-action'}:{label?:string,targetId?:string}) {
 const t=useMessages({'zh-CN':{count:'次数',add:'加一次',reset:'重置'},en:{count:'Count',add:'Add one',reset:'Reset'}});const root=useRef<HTMLDivElement>(null),[count,setCount]=useState(0);const run=useActions(root,{add:()=>setCount(value=>value+1),reset:()=>setCount(0)},{clear:()=>setCount(0)});
 return <div ref={root} className="feature-counter" data-feature-counter><span>{label??t.count}：<output>{count}</output></span><button id={targetId+'-add'} className="pm-ui-button" onClick={()=>run('add')}>{t.add}</button><button id={targetId+'-reset'} className="pm-ui-button" onClick={()=>run('reset')}>{t.reset}</button></div>
}
