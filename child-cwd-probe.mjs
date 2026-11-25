import { randomUUID } from 'node:crypto'
export const inject = ['agents', 'connection', 'presmium', 'deltabox']
export function apply(ctx) {
 let sequence=0
 const trace=(target,names)=>{for(const name of names){const original=target[name];target[name]=async function(...args){const id=++sequence;console.log('CWD TRACE',id,name,'begin',args[0]?.session?.id??'');try{const result=await original.apply(this,args);console.log('CWD TRACE',id,name,'done');return result}catch(error){console.log('CWD TRACE',id,name,'FAILED',String(error));throw error}}}}
 trace(ctx.presmium.bindings,['candidateOf','prepareCandidateRoot','refreshCandidate','retireCandidate'])
 trace(ctx.deltabox,['acquireFor','closeView'])
 trace(ctx.deltabox.paths,['install','detach','remove'])
 ctx.on('agent/pre-step',async({agent},next)=>{console.log('CWD TRACE pre-step',agent.session.id);return next()})

 const handles = new Map()
 ctx.effect(() => () => Promise.all([...handles.values()].map(value => value.dispose())))
 ctx.connection.fetch.register({path:'/api/probe/child',methods:['POST'],requestBody:'buffered',async fetch(request){
  const {parent,cwd,dispose,prompt}=await request.json()
  if(prompt){const handle=handles.get(prompt);if(!handle)throw Error('Unknown child');handle.agent.followup({id:randomUUID(),role:'user',content:[{type:'text',text:'Edit the shared candidate as a child'}],source:{kind:'user'}});return Response.json({started:true})}
  if(dispose){const handle=handles.get(dispose);if(!handle)throw Error('Unknown child');await handle.dispose();handles.delete(dispose);return Response.json({disposed:true})}
  const id=randomUUID();const handle=await ctx.agents.create({sessionId:id,agentOptions:{...ctx.agents.get(parent).options,...ctx.agents.get(parent).model.current()},meta:{cwd,parentSession:parent,origin:'subagent',delegationDepth:1}});handles.set(id,handle);return Response.json({sessionId:id})
 }})
}
