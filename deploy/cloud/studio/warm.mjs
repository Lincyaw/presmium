// Runs at the Studio image's build, as the user Studio runs as, so that no author's start repeats work that is the
// same for everyone (deploy/cloud/studio/presmium_hub.py uses what it leaves in /opt/presmium/warm):
//   space/    the example workspace, already copied and committed, as a new author's /work/space starts;
//   history/  the workspace service's history of that workspace (named by its path, which is the same);
//   jiti/     the transpiled TypeScript of every module Studio, its workspace service and their plugins load: without it
//             each new container transpiles them again, which takes most of a Studio's start.
// It prepares the workspace where authors have it (/work/space) and starts Studio on it once, until it answers.
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const PRESMIUM = '/opt/presmium', WARM = join(PRESMIUM, 'warm'), SPACE = '/work/space'
const STATE = join(process.env.XDG_STATE_HOME, 'presmium')
for (const dir of ['home', 'state', 'cache', 'config']) mkdirSync(join('/work', dir), { recursive: true, mode: 0o700 })
execFileSync('node', [join(PRESMIUM, 'examples/gallery/try.mjs'), SPACE], { stdio: 'inherit' })
// jiti keeps its cache in the temporary directory; the image's /tmp already holds a root-owned one from the build.
const TMP = '/work/.warm-tmp'
mkdirSync(TMP, { recursive: true })

const studio = spawn('node', [join(PRESMIUM, 'packages/presmium/bin/presmium.mjs'), 'studio', SPACE, '--port', '18998',
  '--public-url', 'http://127.0.0.1:18998/', '--preview-url', 'http://127.0.0.1:18999/', '--preview-port', '18999'], { stdio: 'inherit', detached: true, env: { ...process.env, TMPDIR: TMP } })
const ready = () => {
  const dir = join(STATE, 'studio')
  return existsSync(dir) && readdirSync(dir).some(name => name.endsWith('.json') && readFileSync(join(dir, name), 'utf8').includes('?token='))
}
const until = Date.now() + 600_000
while (!ready()) {
  if (studio.exitCode !== null || Date.now() > until) throw new Error('Studio did not start while warming the image')
  await new Promise(done => setTimeout(done, 500))
}
// The workspace's document tree, as Studio's first page asks for it.
const service = readdirSync(join('/work/cache/presmium/serve')).map(dir => join('/work/cache/presmium/serve', dir, 'server.json')).find(file => existsSync(file))
if (service) {
  const { url, launcherToken } = JSON.parse(readFileSync(service, 'utf8'))
  await fetch(`${url}/__presmium/presmium.workspace/tree`, { headers: { authorization: `Bearer ${launcherToken}` } }).catch(() => undefined)
}
process.kill(-studio.pid, 'SIGTERM')
await new Promise(done => { studio.once('exit', done); setTimeout(done, 20_000) })
try { process.kill(-studio.pid, 'SIGKILL') } catch { /* Already gone. */ }

for (const dir of readdirSync(WARM)) rmSync(join(WARM, dir), { recursive: true, force: true })
execFileSync('mv', [SPACE, join(WARM, 'space')])
if (existsSync(join(STATE, 'history'))) cpSync(join(STATE, 'history'), join(WARM, 'history'), { recursive: true })
cpSync(join(TMP, 'jiti'), join(WARM, 'jiti'), { recursive: true })
// The image's /work stays empty: each author's volume is mounted there.
for (const dir of readdirSync('/work')) rmSync(join('/work', dir), { recursive: true, force: true })
console.log(`warm: ${readdirSync(WARM).join(', ')}`)
