import {createRequire} from 'node:module'
import {mkdtemp,mkdir,writeFile,readFile,realpath} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {randomUUID} from 'node:crypto'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
const require=createRequire(import.meta.url);const koffi=require('koffi');const lite=require('deltabox-lite');const {NativeDeltabox}=require(lite.nativePath())
const kernel=koffi.load('kernel32.dll')
const define=kernel.func('__stdcall','DefineDosDeviceW','int',['uint32','str16','str16'])
const query=kernel.func('__stdcall','QueryDosDeviceW','uint32',['str16','void *','uint32'])
const error=kernel.func('__stdcall','GetLastError','uint32',[])
const parent=await mkdtemp(join(tmpdir(),'presmium-dos-'));const root=join(parent,'source');await mkdir(root);await writeFile(join(root,'sample.txt'),'before\n')
const native=new NativeDeltabox(root,lite.binaryPath(),{fsMode:'cbcow-private',isolation:'deltabox'});const session=await native.startSession(undefined,'fast',undefined,'cbcow-private',true);console.log(JSON.stringify({session}))
const name='PresmiumProbe'+randomUUID().replaceAll('-','');const target='\\??\\'+session.mountpoint
if(!define(9,name,target))throw Error('DefineDosDevice '+error())
try{
 const buffer=Buffer.alloc(65536);const size=query(name,buffer,buffer.length/2);console.log(JSON.stringify({name,target,size,defined:buffer.toString('utf16le').split('\0')[0],error:error()}))
 for(const prefix of ['\\\\.\\','\\\\?\\']){
  const alias=prefix+name+'\\';
  try{console.log(JSON.stringify({alias,real:await realpath(alias).catch(e=>String(e)),text:await readFile(join(alias,'sample.txt'),'utf8')}))}catch(e){console.log(JSON.stringify({alias,hostFailure:String(e)}));continue}
  const ps=join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');const script=`Set-Location -LiteralPath '${alias}'; (Get-Location).Path; Get-Content -LiteralPath '${join(alias,'sample.txt')}'`
  const env={...process.env};delete env.PSModulePath;
  try{console.log(JSON.stringify({alias,hostPowerShell:await promisify(execFile)(ps,['-NoProfile','-NonInteractive','-Command',script],{env,timeout:15000})}))}catch(e){console.log(JSON.stringify({alias,hostPowerShellFailure:String(e),stderr:e.stderr}))}
  for(const argv of [[process.execPath,'-e',`console.log(require('node:fs').readFileSync(${JSON.stringify(join(alias,'sample.txt'))},'utf8'))`],[ps,'-NoProfile','-NonInteractive','-Command',script]]){
   try{console.log(JSON.stringify({alias,argv,result:await native.exec(session.session_id,argv,session.mountpoint,[],undefined,'workspace-write')}))}catch(e){console.log(JSON.stringify({alias,argv,nativeFailure:String(e)}))}
  }
 }
}finally{console.log(JSON.stringify({removed:define(15,name,target),error:error()}));await native.stopSession(session.session_id)}
