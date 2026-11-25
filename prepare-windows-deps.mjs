import {mkdirSync,writeFileSync,symlinkSync} from 'node:fs'
import {join} from 'node:path'
export function prepareWindowsDependencies(ws) {
 const a=join(ws,'local-packages','a'),b=join(ws,'local-packages','b'),modules=join(ws,'node_modules')
 for(const dir of [a,b,modules,join(a,'node_modules'),join(b,'node_modules'),join(modules,'fixture-built-dependency'),join(modules,'fixture-dev-plugin')])mkdirSync(dir,{recursive:true})
 const json=(file,value)=>writeFileSync(file,JSON.stringify(value,null,2)+'\n')
 json(join(ws,'package.json'),{name:'presmium-native-candidate-fixture',private:true,type:'module',dependencies:{'fixture-local-plugin':'workspace:*','fixture-alias':'npm:fixture-local-plugin@1.0.0'},devDependencies:{'fixture-dev-plugin':'1.0.0'}})
 json(join(a,'package.json'),{name:'fixture-local-plugin',version:'1.0.0',main:'index.cjs',exports:{'.':'./index.cjs','./presmium':'./presmium.cjs'},dependencies:{'fixture-peer-b':'workspace:*','fixture-built-dependency':'1.0.0'}})
 json(join(b,'package.json'),{name:'fixture-peer-b',version:'1.0.0',main:'index.cjs',dependencies:{'fixture-local-plugin':'workspace:*'}})
 writeFileSync(join(a,'index.cjs'),"exports.marker='local-dependency-ok';exports.cycle=require('fixture-peer-b').peer();\n")
 writeFileSync(join(b,'index.cjs'),"exports.peer=()=>require('fixture-local-plugin').marker;\n")
 writeFileSync(join(a,'presmium.cjs'),"const a=require('./index.cjs');const built=require('fixture-built-dependency');const dev=require('fixture-dev-plugin');if(built!==42||dev!==43||a.marker!==a.cycle)throw Error('Dependency snapshot failed');module.exports={id:'probe.native',version:'1.0.0',server:()=>({routes:{'/marker':{handle:()=>Response.json({...a,built,dev})}}})};\n")
 json(join(modules,'fixture-built-dependency','package.json'),{name:'fixture-built-dependency',version:'1.0.0',main:'generated.cjs',scripts:{postinstall:"node -e \"require('fs').writeFileSync('generated.cjs','module.exports=42')\""}})
 writeFileSync(join(modules,'fixture-built-dependency','generated.cjs'),'module.exports=42\n')
 json(join(modules,'fixture-dev-plugin','package.json'),{name:'fixture-dev-plugin',version:'1.0.0',main:'index.cjs',bin:{'fixture-dev':'cli.cmd'}})
 writeFileSync(join(modules,'fixture-dev-plugin','index.cjs'),'module.exports=43\n')
 writeFileSync(join(modules,'fixture-dev-plugin','cli.cmd'),'@echo fixture-dev-bin-ok\r\n')
 for(const [target,link] of [[a,join(modules,'fixture-local-plugin')],[a,join(modules,'fixture-alias')],[b,join(a,'node_modules','fixture-peer-b')],[a,join(b,'node_modules','fixture-local-plugin')]])symlinkSync(target,link,'junction')
 return a
}
