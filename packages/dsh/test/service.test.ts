import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeModel } from '@lincyaw/cli/testing'
import type { FakeModel } from '@lincyaw/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testHome, turns } from './harness.ts'
import type { TestHome, Workspace } from './harness.ts'

interface Proc { pid: number, ppid: number, cmdline: string }

function descendants(pid: number): Proc[] {
  const all = execFileSync('ps', ['-ww', '-axo', 'pid=,ppid=,args='], { encoding: 'utf8' }).split('\n').flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), cmdline: match[3]! }] : []
  })
  const out: Proc[] = []
  const walk = (parent: number) => {
    for (const child of all.filter(proc => proc.ppid === parent)) {
      out.push(child)
      walk(child.pid)
    }
  }
  walk(pid)
  return out
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function environ(pid: number): Record<string, string> {
  return Object.fromEntries(readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0').filter(Boolean).map((entry) => {
    const at = entry.indexOf('=')
    return [entry.slice(0, at), entry.slice(at + 1)]
  }))
}

describe('the workspace service DeepSeek Harness starts itself', () => {
  let home: TestHome
  let ws: Workspace
  let model: FakeModel
  beforeAll(async () => {
    home = testHome('service')
    ws = home.workspace('service', { 'lecture.md': '---\ntitle: 进程\n---\n\n# 进程\n\n(first)=\n## 第一节\n\n正文。\n' })
    model = await fakeModel([{ tool: 'presmium__list_sections', input: {} }])
  }, 60_000)
  afterAll(async () => {
    model?.release()
    await model?.close()
    await home?.close()
  })

  it.skipIf(process.platform === 'win32')('runs in its own process group without the model\'s credentials or the launcher\'s variables, and leaves no process after kill -9 of the host', async () => {
    model.hold()
    const run = home.headless(ws.dir, '列出章节。', { model, env: { PRESMIUM_MODEL_URL: model.url, PRESMIUM_MODEL_KEY: 'model-key-5d1', PRESMIUM_MODEL_PROVIDER: 'Fake', PORT: '5999' } })
    await expect.poll(() => turns(model).length, { timeout: 180_000 }).toBeGreaterThan(0)
    const watchdog = descendants(run.child.pid!).find(proc => proc.cmdline.includes('watchdog.mjs'))!
    const serve = descendants(watchdog.pid).find(proc => / serve /.test(proc.cmdline))!
    expect(serve, run.output()).toBeDefined()
    if (process.platform === 'linux') {
      const seen = environ(serve.pid)
      expect(seen.PRESMIUM_SERVICE_TOKEN).toMatch(/^\S{20,}$/)
      expect(Object.keys(seen).filter(name => /^(DEEPSEEK_|DSH_|PRESMIUM_MODEL_)/.test(name) || name === 'PORT')).toEqual([])
    } else {
      console.info('Skipping child-environment inspection: Linux /proc/<pid>/environ is required; service startup and process cleanup are still checked.')
    }
    const state = join(home.dir, 'cache', 'presmium', 'serve')
    const { url } = JSON.parse(readFileSync(join(state, readdirSync(state)[0]!, 'server.json'), 'utf8')) as { url: string }
    await fetch(`${url}/`).then(response => response.text())
    await expect.poll(() => descendants(serve.pid).length, { timeout: 120_000 }).toBeGreaterThan(0)
    const started = [watchdog, ...descendants(watchdog.pid)].map(proc => proc.pid)

    process.kill(watchdog.ppid, 'SIGKILL')
    await expect.poll(() => started.filter(alive), { timeout: 30_000 }).toEqual([])
    await run.exited
  }, 300_000)
})
