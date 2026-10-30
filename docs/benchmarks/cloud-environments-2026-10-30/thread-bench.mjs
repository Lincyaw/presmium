import {createRequire} from 'node:module';
import {mkdirSync,cpSync,readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const root=`/work/${process.argv[2]}`;
mkdirSync(root,{recursive:true});
cpSync('/opt/presmium/examples/animations/guide-steps',root+'/guide-steps',{recursive:true,preserveTimestamps:true,filter:p=>!p.includes('/.presmium')});
const original=createHash('sha256').update(readFileSync(root+'/guide-steps/lecture.json')).digest('hex');
const require=createRequire('/opt/presmium/packages/cli/package.json');
const {createJiti}=require('jiti');const jiti=createJiti('/opt/presmium/packages/cli/package.json');
const start=performance.now();const {Compiler,build,relativeIR}=await jiti.import('@lincyaw/compiler');const imported=performance.now();
const compiler=new Compiler(root+'/guide-steps',{bundled:'/opt/presmium/packages/presmium',workspaceRoot:root,priority:'interactive'});
const results=[];
for(let i=0;i<2;i++){
 const begin=performance.now();const compilation=await compiler.compile();const compiled=performance.now();
 const report=await build(compilation,{outDir:root+`/out-${i}`,to:['web']});const done=performance.now();
 const errors=report.findings.filter(x=>x.severity==='error');
 results.push({phase:i?'warm':'cold',compileMs:compiled-begin,webBuildMs:done-compiled,totalMs:done-begin,errors:errors.map(x=>({id:x.checkId,message:x.message})),sections:compilation.doc.sections.length,maxRssKiB:process.resourceUsage().maxRSS});
}
const after=createHash('sha256').update(readFileSync(root+'/guide-steps/lecture.json')).digest('hex');
console.log('BENCH_RESULT '+JSON.stringify({trial:process.argv[2],threads:Number(process.env.RAYON_NUM_THREADS),importMs:imported-start,sourceHash:original,sourceUnchanged:original===after,results}));
process.exit(results.some(x=>x.errors.length)?1:0);
