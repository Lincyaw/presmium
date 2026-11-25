import {createRequire} from 'node:module'
import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawnSync} from 'node:child_process'
const require=createRequire(join(process.cwd(),'packages/dsh/package.json'));const {createJiti}=require('jiti');const jiti=createJiti(join(process.cwd(),'package.json'));const {launchEnv}=await jiti.import('./packages/dsh/src/node/launch.ts');const result=spawnSync(process.execPath,[process.argv[2]||'native-cwd-probe.mjs'],{env:{...process.env,...launchEnv(mkdtempSync(join(tmpdir(),'presmium-probe-home-')))},stdio:'inherit'});process.exitCode=result.status??1
