export const inject = ['presmium', 'deltabox']
export function apply(ctx) {
 let sequence=0
 const trace=(target,names)=>{for(const name of names){const original=target[name];target[name]=async function(...args){const id=++sequence;console.log('CWD TRACE',id,name,'begin',args[0]?.session?.id??'');try{const result=await original.apply(this,args);console.log('CWD TRACE',id,name,'done');return result}catch(error){console.log('CWD TRACE',id,name,'FAILED',String(error));throw error}}}}
 trace(ctx.presmium.bindings,['candidateOf','prepareCandidateRoot','refreshCandidate','retireCandidate'])
 trace(ctx.deltabox,['acquireFor','closeView'])
 trace(ctx.deltabox.paths,['install','detach','remove'])
 ctx.on('agent/pre-step',async({agent},next)=>{console.log('CWD TRACE pre-step',agent.session.id);return next()})
}
