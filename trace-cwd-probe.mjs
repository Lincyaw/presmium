export const inject = ['presmium', 'deltabox', 'connection', 'agents']
export async function apply(ctx) {
 // The legacy direct carrier omits Studio's outer watchdog; mirror its exact native ownership.
 if(process.platform==='win32'){(await import('./packages/dsh/src/node/watchdog-windows.mjs')).ownedWindowsJob();console.log('CWD native carrier ownership installed before any Agent');}
 ctx.on('agent/error',({agent,error})=>console.log('CWD AGENT ERROR',agent.session.id,error?.stack??String(error)))
 ctx.on('agent/status',({agent,status})=>console.log('CWD AGENT STATUS',agent.session.id,status))
 ctx.connection.fetch.register({path:'/api/probe/dependencies',methods:['POST'],requestBody:'buffered',async fetch(request){const {session}=await request.json();const agent=ctx.agents.get(session);const candidate=await ctx.presmium.bindings.candidateOf(agent);const response=await candidate.request('/__presmium/probe.native/marker');if(!response.ok)console.log('CWD DEPENDENCY ERROR',await response.clone().text());return new Response(response.body,{status:response.status,headers:{'content-type':'application/json'}})}})
 let sequence=0
 const trace=(target,names)=>{for(const name of names){const original=target[name];target[name]=async function(...args){const id=++sequence;console.log('CWD TRACE',id,name,'begin',args[0]?.session?.id??'');try{const result=await original.apply(this,args);console.log('CWD TRACE',id,name,'done');return result}catch(error){console.log('CWD TRACE',id,name,'FAILED',String(error));throw error}}}}
 trace(ctx.presmium.bindings,['candidateOf','prepareCandidateRoot','refreshCandidate','retireCandidate'])
 trace(ctx.deltabox,['acquireFor','closeView'])
 trace(ctx.deltabox.paths,['install','detach','remove'])
 ctx.on('agent/pre-step',async({agent},next)=>{console.log('CWD TRACE pre-step',agent.session.id);return next()})
}
