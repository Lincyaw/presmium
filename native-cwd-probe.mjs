import {createRequire} from 'node:module'
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm,lstat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import assert from 'node:assert/strict'
const require=createRequire(join(process.cwd(),'packages/dsh/package.json'))
const lite=require(require.resolve('deltabox-lite',{paths:[require.resolve('dsh-deltabox/package.json')]}))
const {NativeDeltabox}=lite.loadNative()
const root=await mkdtemp(join(tmpdir(),'presmium-native-cwd-'));const project=join(root,'source');await mkdir(project);await writeFile(join(project,'sample.txt'),'before\n')
const parent=process.platform==='win32'?join(process.env.ProgramData,'Presmium','cwd-probes'):join(tmpdir(),'presmium-cwd-probes')
await mkdir(parent,{recursive:true,mode:0o700});const owned=await mkdtemp(join(parent,'view-'));const alias=join(owned,'workspace')
const native=new NativeDeltabox(project,lite.binaryPath(),{fsMode:'cbcow-private',isolation:'deltabox'})
const quote=x=>"'"+x.replaceAll("'",process.platform==='win32'?"''":"'\\''")+"'"
let previous;const observations=[]
for(let round=0;round<2;round++){
 const session=await native.startSession(undefined,'fast',undefined,'cbcow-private',true);assert.ok(session.mountpoint);assert.notEqual(session.mountpoint,previous);previous=session.mountpoint
 if(process.platform==='win32') {
  console.log(JSON.stringify({baselineSession:session}));
  try { console.log(JSON.stringify({baseline:await native.exec(session.session_id,[join(process.env.SystemRoot,'System32','cmd.exe'),'/d','/c','cd'],session.mountpoint,[],undefined,'workspace-write')})) }
  catch(error) { console.log(JSON.stringify({baselineFailure:String(error)}));throw error }
 }
 await rm(alias,{force:true});await symlink(session.mountpoint,alias,process.platform==='win32'?'junction':'dir');await native.beginReview(session.session_id,'task','stable cwd probe')
 const command=process.platform==='win32'?`Set-Location -LiteralPath ${quote(alias)}; if (-not $?) { exit 1 }; (Get-Location).Path; [Environment]::CurrentDirectory; & "$env:SystemRoot\\System32\\cmd.exe" /d /c cd; Get-Content -LiteralPath sample.txt; Set-Content -LiteralPath sample.txt -Value after${round} -Encoding utf8`:`cd -- ${quote(alias)} || exit; pwd; /bin/pwd -P; cat sample.txt; printf 'after${round}\\n' > sample.txt`
 const argv=process.platform==='win32'?[join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),'-NoProfile','-NonInteractive','-Command',command]:['/bin/bash','-c',command]
 const result=await native.exec(session.session_id,argv,session.mountpoint,[],undefined,'workspace-write');console.log(JSON.stringify({round,alias,session,result}));assert.equal(result.exit_code,0);assert.ok(result.stdout.toLowerCase().includes(alias.toLowerCase()));assert.notEqual((await readFile(join(project,'sample.txt'),'utf8')).replace(/^\uFEFF/,''),'after'+round+'\n')
 const tamper=process.platform==='win32'?`try {[IO.Directory]::Delete(${quote(alias)},$false); exit 42} catch {Write-Output 'entry stayed read-only'}`:`rm -- ${quote(alias)} && exit 42; exit 0`
 const denied=await native.exec(session.session_id,[...argv.slice(0,-1),tamper],session.mountpoint,[],undefined,'workspace-write');console.log(JSON.stringify({tamper:denied}));assert.notEqual(denied.exit_code,42);assert.ok((await lstat(alias)).isSymbolicLink())
 await native.reviewCommit(session.session_id);assert.ok((await readFile(join(project,'sample.txt'),'utf8')).includes('after'+round));observations.push({alias,stdout:result.stdout,mountpoint:session.mountpoint});await native.stopSession(session.session_id)
}
console.log(JSON.stringify({platform:process.platform,observations,passed:true}))
