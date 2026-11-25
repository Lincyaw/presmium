import {prepareWindowsDependencies} from './prepare-windows-deps.mjs'
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {mkdtempSync,readFileSync,writeFileSync,symlinkSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
const root=process.cwd()
writeFileSync(root+'/trace-cwd-probe.yml', '- insert:\n    - id: trace-cwd-probe\n      name: '+JSON.stringify(root+'/trace-cwd-probe.mjs')+'\n')
const require=createRequire(root+'/packages/dsh/package.json');const {createJiti}=require('jiti');const jiti=createJiti(root+'/')
const {testHome,running}=await jiti.import('./packages/dsh/test/harness.ts');const {fakeModel}=await jiti.import('./packages/dsh/src/node/fake-model.ts')
const ws=mkdtempSync(join(tmpdir(),'presmium-stable-manual-doc-'));const file=ws+'/index.pmd'
if(process.platform!=='win32')symlinkSync(root+'/packages/presmium/node_modules',ws+'/node_modules','dir');writeFileSync(ws+'/.gitignore','node_modules/\n.presmium/\n')
const localDependency=process.platform==='win32'?prepareWindowsDependencies(ws):undefined
const base=JSON.parse(readFileSync(root+'/packages/workspace/templates/document/default/index.pmd','utf8'));if(localDependency)base.metadata.plugins.push('fixture-local-plugin');base.metadata.title='Base';base.sections.intro.title='Base';writeFileSync(file,JSON.stringify(base,null,2)+'\n')
writeFileSync(ws+'/presmium.workspace.yaml','title: Stable candidate\nsettings:\n  presmium.assistant:\n    review: required\n')
const read={tool:'read',input:{file_path:'index.pmd'}};const pwd={tool:process.platform==='win32'?'pwsh':'bash',input:{command:process.platform==='win32'?'(Get-Location).Path; if ((Get-Content -LiteralPath node_modules/fixture-built-dependency/generated.cjs -Raw) -notmatch 42) { throw \'Missing built dependency\' }; & ./node_modules/.bin/fixture-dev.cmd; if ($LASTEXITCODE -ne 0) { throw \'Dependency command failed\' }':'pwd',description:'Read candidate directory'}}
const edit=(before,after)=>({tool:'edit',input:{file_path:'index.pmd',old_string:'"title": "'+before+'"',new_string:'"title": "'+after+'"',replace_all:true}})
const script=[pwd,read,edit('Base','Draft A'),pwd,{text:'done1'},read,edit('Base','Draft B'),pwd,{text:'done2'},read,edit('Author independent','Draft C'),pwd,{text:'done3'},read,edit('Draft C','Draft D'),read,edit('Draft D','Draft E'),pwd,{text:'done4'}]
const model=await fakeModel(script);const progress=setInterval(()=>console.log('requests',model.received.filter(x=>x.body.tools?.length).length),10000);const home=testHome('stable-manual');let service,web
async function serveMain(directory){
 const token=randomUUID();const process_=running(spawn(process.execPath,[root+'/packages/presmium/bin/presmium.mjs','serve',directory,'--port','0'],{cwd:directory,env:home.env({PRESMIUM_SERVICE_TOKEN:token}),stdio:['ignore','pipe','pipe']}));
 const url=(await process_.wait(/^serve {2}(http\S+)$/m,180000))[1];const canonical=(await process_.wait(/^workspace {2}(.+)$/m))[1].trim();
 return {url,root:canonical,token,env:{PRESMIUM_SERVICE_URL:url,PRESMIUM_SERVICE_TOKEN:token,PRESMIUM_WORKSPACE:canonical},process:process_,stop:()=>process_.stop()}
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));async function until(f){const end=Date.now()+180000;for(;;){const x=await f();if(x)return x;if(Date.now()>end)throw Error('timeout');await sleep(100)}}
try{
 service=await serveMain(ws);web=await home.web(ws,5647,{model,patches:[root+'/trace-cwd-probe.yml'],env:{...service.env,PRESMIUM_COMMAND:root+'/packages/presmium/bin/presmium.mjs',PRESMIUM_INSTALLATION:root+'/packages/presmium'}});const api=await web.api();const {sessionId}=await api.call('session/create',{request:{cwd:ws}})
 async function review(path='',body){const res=await fetch(service.url+'/__presmium/presmium.workspace/review'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+service.token,'content-type':'application/json'},...body?{body:JSON.stringify(body)}:{}});return {status:res.status,body:await res.json()}}
 const turns=()=>model.received.filter(x=>x.body.tools?.length)
 async function prompt(n){await api.call('session/prompt',{request:{requestId:randomUUID(),sessionId,mode:'queue',content:[{type:'text',text:'Perform validation round '+n}]}});await until(()=>turns().length>=[5,9,13,19][n-1]);await sleep(300);return until(async()=>{const r=await review();return r.body.review&&!r.body.review.running?r.body.review:false})}
 let current=await prompt(1);assert.equal(JSON.parse(readFileSync(file)).metadata.title,'Base');assert.equal(JSON.parse(readFileSync(current.workspace?.root??(await review('/workspace',{session:sessionId})).body.root+'/index.pmd')).metadata?.title,'Draft A')
 if(localDependency){const dep=await api.fetch('/api/probe/dependencies',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session:sessionId})});assert.equal(dep.status,200);assert.equal((await dep.json()).marker,'local-dependency-ok')}
 assert.equal((await review('/reject',{})).status,200);assert.equal(JSON.parse(readFileSync(file)).metadata.title,'Base');console.log('required review and rejection preserved author')
 if(localDependency)writeFileSync(localDependency+'/index.cjs',"exports.marker='dependency-updated';exports.cycle=require('fixture-peer-b').peer();\n");
 current=await prompt(2);if(localDependency){const dep=await api.fetch('/api/probe/dependencies',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session:sessionId})});assert.equal(dep.status,200);assert.equal((await dep.json()).marker,'dependency-updated');console.log('local cyclic dependency refresh, generated artifact and dev dependency preserved')}const author=structuredClone(base);author.metadata.title='Author independent';writeFileSync(file,JSON.stringify(author,null,2)+'\n');const conflict=await review('/accept',{});assert.equal(conflict.status,409);assert.equal(JSON.parse(readFileSync(file)).metadata.title,'Author independent');console.log('source conflict rejected without overwriting author')
 current=await prompt(3);assert.equal((await review('/accept',{})).status,200);assert.equal(JSON.parse(readFileSync(file)).metadata.title,'Draft C');console.log('fresh read and accepted publication succeeded')
 current=await prompt(4);assert.ok(current.steps.length>=2);const restored=await review('/restore',{step:current.steps[1].id});assert.equal(restored.status,200);assert.equal((await review('/accept',{})).status,200);assert.equal(JSON.parse(readFileSync(file)).metadata.title,'Draft D');console.log('step restoration and publication succeeded')
 const messages=turns().at(-1).body.messages;const blocks=messages.flatMap(m=>Array.isArray(m.content)?m.content:[]);const results=blocks.filter(x=>x.type==='tool_result');assert.equal(results.filter(x=>x.is_error).length,0);const pwds=results.flatMap(x=>x.content?.[0]?.text?.split('\n')??[]).map(x=>x.trim()).filter(x=>(/^pm[0-9a-f]{32}:\\/i.test(x)||/^\/tmp\/presmium-agent-.*workspace$/.test(x)));assert.ok(pwds.length>=4);assert.equal(new Set(pwds).size,1);const notices=blocks.filter(x=>x.type==='text'&&x.text?.startsWith('The working directory'));assert.equal(notices.length,1);console.log('same chat across four turns: stable pwd, one initial notice, all tools succeeded',ws)
}catch(error){console.error(error);console.log('received request summaries',JSON.stringify(model.received.map(r=>({path:r.path,model:r.body.model,tools:r.body.tools?.length})))); const messages=model.received.at(-1)?.body.messages??[];console.log('latest tool results',JSON.stringify(messages.filter(m=>m.role==='tool'||Array.isArray(m.content)&&m.content.some(b=>b.type==='tool_result')).slice(-10)));console.log('full host output',web?.process?.output?.());console.log('source service output',service?.process?.output?.());process.exitCode=1}
finally{clearInterval(progress);writeFileSync(join(tmpdir(),'presmium-stable-manual-requests.json'),JSON.stringify(model.received.map(x=>({path:x.path,body:x.body})),null,2));if(web)await web.stop();if(service)await service.stop();await model.close();await home.close()}
