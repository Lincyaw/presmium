// Measures the real lecture's frame path without synthesizing speech or changing its source.
// node scripts/bench-lecture-export.mjs <document> [--start-ms 0] [--frames 60] [--rounds 2] [--output result.json]
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { availableParallelism, loadavg, tmpdir, totalmem } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  'start-ms': { type: 'string', default: '0' }, frames: { type: 'string', default: '60' },
  rounds: { type: 'string', default: '2' }, output: { type: 'string' }, help: { type: 'boolean' },
} })
if (values.help || positionals.length !== 1) {
  console.log('Usage: node scripts/bench-lecture-export.mjs <document> [--start-ms 0] [--frames 60] [--rounds 2] [--output result.json]\nBuilds one isolated static lecture, then compares ordinary and fast lossless PNG capture at identical times. No speech generation, source edits or test suites. Each round uses one fresh browser context; capture order alternates. Reports decoded RGBA equality and separate advance/font/capture timings.')
  process.exit(values.help ? 0 : 1)
}
const frames = Number(values.frames), rounds = Number(values.rounds), start = Number(values['start-ms'])
if (!Number.isInteger(frames) || frames < 1 || frames > 1000 || !Number.isInteger(rounds) || rounds < 1 || rounds > 10 || !Number.isFinite(start) || start < 0) throw new Error('Invalid benchmark bounds')
const root = fileURLToPath(new URL('..', import.meta.url))
const lectureRequire = createRequire(join(root, 'packages/addon-lecture/package.json'))
const { createJiti } = lectureRequire('jiti')
const jiti = createJiti(join(root, 'package.json'))
const { Compiler, build, playwrightChromium, serveDirectory } = await jiti.import(lectureRequire.resolve('@lincyaw/compiler'))
const { defaultTrack, lectureVideoOptions } = await jiti.import(lectureRequire.resolve('@lincyaw/addon-lecture/domain'))
const sharp = createRequire(join(root, 'packages/web/package.json'))('sharp')
const document = resolve(positionals[0]), work = mkdtempSync(join(tmpdir(), 'presmium-export-bench-'))
const result = { document, measuredAt: new Date().toISOString(), frames, rounds, startMs: start,
  runtime: { node: process.version, cpus: availableParallelism(), memoryBytes: totalmem(), load: loadavg() }, samples: [], complete: false }
const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length
const summary = xs => ({ mean: mean(xs), median: [...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)], total: xs.reduce((a,b)=>a+b,0) })
let server, browser
try {
  const began = performance.now(), compilation = await new Compiler(document).compile()
  const report = await build(compilation, { outDir: work, to: ['web', 'lecture'] })
  const errors = report.findings.filter(f => f.severity === 'error')
  if (errors.length) throw new Error(errors.map(e=>e.message).join('\n'))
  const web = report.outputs.find(o=>o.renderer==='web'), lecture = report.outputs.find(o=>o.renderer==='lecture')
  if (!web || !lecture) throw new Error('No static lecture output')
  const { readFileSync } = await import('node:fs')
  const index = JSON.parse(readFileSync(join(lecture.outDir,'index.json'),'utf8'))
  const track = defaultTrack(index.map(t=>t.id)), config = lectureVideoOptions(compilation.doc.config.renderers.lecture)
  if (!track || config === 'invalid') throw new Error('No configured lecture')
  const [width,height] = config.size ?? [1920,1080], fps = config.fps ?? 30
  Object.assign(result, { source: compilation.doc.source, width, height, fps, buildMs: performance.now()-began })
  server = await serveDirectory(work)
  browser = await (await playwrightChromium(document, lectureRequire.resolve('@lincyaw/addon-lecture/presmium'))).launch()
  result.runtime.chromium = browser.version()
  for (let round=0;round<rounds;round++) {
    const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:1,reducedMotion:'reduce',serviceWorkers:'block'})
    let session
    try {
      const page=await context.newPage(), failures=[]
      page.on('pageerror',e=>failures.push(e.message))
      await page.goto(`${server.url}${web.base}?view=lecture&track=${encodeURIComponent(track)}&export${config.burn ? `&captions=${encodeURIComponent(config.burn)}`:''}`)
      await page.waitForFunction('Boolean(window.presmiumLecture)',undefined,{timeout:120000})
      const duration=await page.evaluate(()=>window.presmiumLecture.duration)
      if (start+(frames-1)*1000/fps>=duration) throw new Error('Benchmark passes the lecture end')
      await page.addStyleTag({content:'* { caret-color: transparent !important; }'})
      session=await context.newCDPSession(page)
      await page.evaluate(async t=>{await window.presmiumLecture.advance(t);await document.fonts.ready},Math.round(start))
      const advance=[], fonts=[], ordinary=[], fast=[], ordinaryBytes=[], fastBytes=[]
      let differentFrames=0, differentPixels=0, maxChannelDelta=0
      for(let frame=0;frame<frames;frame++) {
        let t=performance.now()
        await page.evaluate(t=>window.presmiumLecture.advance(t),Math.round(start+frame*1000/fps))
        advance.push(performance.now()-t)
        t=performance.now();await page.evaluate(()=>document.fonts.ready.then(()=>undefined));fonts.push(performance.now()-t)
        const take = async mode=>{
          const began=performance.now()
          const png=mode==='ordinary' ? await page.screenshot({type:'png'}) : Buffer.from((await session.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false,optimizeForSpeed:true})).data,'base64')
          ;(mode==='ordinary'?ordinary:fast).push(performance.now()-began)
          ;(mode==='ordinary'?ordinaryBytes:fastBytes).push(png.length)
          return png
        }
        const order=(frame+round)%2 ? ['fast','ordinary']:['ordinary','fast'], images={}
        for(const mode of order) images[mode]=await take(mode)
        const [a,b]=await Promise.all([sharp(images.ordinary).ensureAlpha().raw().toBuffer({resolveWithObject:true}),sharp(images.fast).ensureAlpha().raw().toBuffer({resolveWithObject:true})])
        if(a.info.width!==width||a.info.height!==height||b.info.width!==width||b.info.height!==height) throw new Error('Frame size changed')
        if(!a.data.equals(b.data)) {
          differentFrames++
          for(let i=0;i<a.data.length;i+=4){let changed=false;for(let c=0;c<4;c++){const d=Math.abs(a.data[i+c]-b.data[i+c]);maxChannelDelta=Math.max(maxChannelDelta,d);changed ||= d!==0}if(changed)differentPixels++}
        }
        if(failures.length) throw new Error(failures.join('\n'))
      }
      const row={ round:round+1, advanceMs:summary(advance),fontsMs:summary(fonts),ordinaryMs:summary(ordinary),fastMs:summary(fast),ordinaryBytes:summary(ordinaryBytes),fastBytes:summary(fastBytes),differentFrames,differentPixels,maxChannelDelta }
      result.samples.push(row);console.error(JSON.stringify(row))
    } finally {
      try {await session?.detach()} finally {await context.close()}
    }
  }
  result.complete=true
} finally {
  try {await browser?.close()} finally {
    try {await server?.close()} finally {
      rmSync(work,{recursive:true,force:true})
      const json=JSON.stringify(result,null,2)+'\n'
      if(values.output){const file=resolve(values.output);mkdirSync(dirname(file),{recursive:true});writeFileSync(file,json)}else console.log(json)
    }
  }
}
