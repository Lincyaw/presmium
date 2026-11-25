import { randomUUID } from 'node:crypto'
export const inject = ['agents', 'connection']
export function apply(ctx) {
 const handles = new Map()
 ctx.effect(() => () => Promise.all([...handles.values()].map(value => value.dispose())))
 ctx.connection.fetch.register({path:'/api/probe/child',methods:['POST'],requestBody:'buffered',async fetch(request){
  const {parent,cwd,dispose,prompt}=await request.json()
  if(prompt){const handle=handles.get(prompt);if(!handle)throw Error('Unknown child');handle.agent.followup({id:randomUUID(),role:'user',content:[{type:'text',text:'Edit the shared candidate as a child'}],source:{kind:'user'}});await handle.agent.whenIdle();return Response.json({settled:true})}
  if(dispose){const handle=handles.get(dispose);if(!handle)throw Error('Unknown child');await handle.dispose();handles.delete(dispose);return Response.json({disposed:true})}
  const id=randomUUID();const handle=await ctx.agents.create({sessionId:id,meta:{cwd,parentSession:parent,origin:'subagent',delegationDepth:1}});handles.set(id,handle);return Response.json({sessionId:id})
 }})
}
