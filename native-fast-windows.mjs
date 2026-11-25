import {createRequire} from 'node:module'
import {mkdtemp,mkdir,writeFile,readFile,symlink,rm,lstat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,dirname} from 'node:path'
import assert from 'node:assert/strict'
const require=createRequire(join(process.cwd(),'package.json'))
const {createJiti}=require('jiti');const jiti=createJiti(join(process.cwd(),'package.json'))
const {CandidatePaths}=await jiti.import('./candidate-paths.ts')
const paths=new CandidatePaths()
const lite=require('deltabox-lite')
const {NativeDeltabox}=require(process.env.PRESMIUM_NATIVE_ADDON||lite.nativePath())
const root=await mkdtemp(join(tmpdir(),'presmium-native-cwd-'));const project=join(root,'source');await mkdir(project);await writeFile(join(project,'sample.txt'),'before\n')
const alias=paths.pathFor(project)
const native=new NativeDeltabox(project,(process.env.PRESMIUM_NATIVE_HELPER||lite.binaryPath()),{fsMode:'cbcow-private',isolation:'deltabox'})
const quote=x=>"'"+x.replaceAll("'",process.platform==='win32'?"''":"'\\''")+"'"
let previous;const observations=[]
for(let round=0;round<2;round++){
 const session=await native.startSession(undefined,'fast',undefined,'cbcow-private',true);assert.ok(session.mountpoint);if(process.platform!=='win32')assert.notEqual(session.mountpoint,previous);previous=session.mountpoint
 const initial=await readFile(join(project,'sample.txt'),'utf8')
 await paths.install(project,session.mountpoint)
 console.log(JSON.stringify({installedEntry:alias,entryContent:await readFile(join(alias,'sample.txt'),'utf8')}))
 if(process.platform==='win32') {
  console.log(JSON.stringify({baselineSession:session}));
  await native.beginReview(session.session_id,'task','native byte abort');await native.writeFile(session.session_id,'sample.txt',Buffer.from('native-write'));assert.equal(await readFile(join(paths.physical(alias),'sample.txt'),'utf8'),'native-write');assert.equal(await readFile(join(project,'sample.txt'),'utf8'),initial);await native.reviewAbort(session.session_id);assert.equal(await readFile(join(paths.physical(alias),'sample.txt'),'utf8'),initial);console.log('private bytes, alias access and native abort passed')
  for(const argv of [[join(process.env.SystemRoot,'System32','cmd.exe'),'/d','/c','cd'],[process.execPath,'-e','console.log(process.cwd())']]) {
   try { console.log(JSON.stringify({baselineArgv:argv,baseline:await native.exec(session.session_id,argv,session.mountpoint,[],undefined,'workspace-write')})) }
   catch(error) { console.log(JSON.stringify({baselineArgv:argv,baselineFailure:String(error)})) }
  }
 }
 await native.beginReview(session.session_id,'task','stable cwd probe')
 const command=process.platform==='win32'?`New-PSDrive -Name '${paths.shellDirectory(session.mountpoint,project).name}' -PSProvider FileSystem -Root ${quote(session.mountpoint)} -Scope Script -ErrorAction Stop | Out-Null; Set-Location -LiteralPath ${quote(paths.shellDirectory(session.mountpoint,project).path)}; if (-not $?) { exit 1 }; (Get-Location).Path; [Environment]::CurrentDirectory; & "$env:SystemRoot\\System32\\cmd.exe" /d /c cd; Get-Content -LiteralPath ${quote(join(alias,'sample.txt'))}; Set-Content -LiteralPath sample.txt -Value after${round} -Encoding utf8`:`cd -- ${quote(alias)} || exit; pwd; /bin/pwd -P; cat sample.txt; printf 'after${round}\\n' > sample.txt`
 const argv=process.platform==='win32'?[join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),'-NoProfile','-NonInteractive','-Command',command]:['/bin/bash','-c',command]
 const result=await native.exec(session.session_id,argv,session.mountpoint,[],undefined,'workspace-write');console.log(JSON.stringify({round,alias,session,result}));assert.equal(result.exit_code,0);assert.ok(result.stdout.toLowerCase().includes(paths.shellDirectory(session.mountpoint,project).path.toLowerCase()));assert.notEqual((await readFile(join(project,'sample.txt'),'utf8')).replace(/^\uFEFF/,''),'after'+round+'\n')
 const outside=await native.exec(session.session_id,[join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe'),'-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; [IO.File]::WriteAllText(${quote(join(project,'sample.txt'))},'escape')`],session.mountpoint,[],undefined,'workspace-write');assert.notEqual(outside.exit_code,0);assert.equal(await readFile(join(project,'sample.txt'),'utf8'),initial);console.log('direct backing write denied by PSEC')
 await native.reviewCommit(session.session_id);assert.ok((await readFile(join(project,'sample.txt'),'utf8')).includes('after'+round));observations.push({alias,stdout:result.stdout,mountpoint:session.mountpoint});await native.stopSession(session.session_id)
}
console.log(JSON.stringify({platform:process.platform,observations,passed:true}))
await paths.close()
