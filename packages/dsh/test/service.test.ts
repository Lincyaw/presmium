// The presmium-service row (docs/design-dsh.md 6.2 and 14, WP-96b): run outside presmium studio, DeepSeek
// Harness's host starts the workspace service itself, in a process group of its own under a watchdog, with a
// service token and without the model's credentials (the deck's code runs there, not in the host). After
// `kill -9` of the host, neither the service nor the dev servers it started are left.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fakeModel } from '@presmium/cli/testing'
import type { FakeModel } from '@presmium/cli/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { testHome, turns } from './harness.ts'
import type { TestHome, Workspace } from './harness.ts'

interface Proc { pid: number, ppid: number, cmdline: string }

/** The processes that descend from `pid` now. */
function descendants(pid: number): Proc[] {
  const all = readdirSync('/proc').filter(name => /^\d+$/.test(name)).flatMap((name) => {
    try {
      const stat = readFileSync(`/proc/${name}/stat`, 'utf8')
      return [{ pid: Number(name), ppid: Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]), cmdline: readFileSync(`/proc/${name}/cmdline`, 'utf8').replaceAll('\0', ' ') }]
    } catch {
      return []
    }
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

/** A process's environment variables, by name. */
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

  it('runs in its own process group without the model\'s credentials, and leaves no process after kill -9 of the host', async () => {
    // The model holds its answer: the run stays in its first turn, the service up.
    model.hold()
    const run = home.headless(ws.dir, '列出章节。', { model, env: {} })
    await expect.poll(() => turns(model).length, { timeout: 180_000 }).toBeGreaterThan(0)
    const watchdog = descendants(run.child.pid!).find(proc => proc.cmdline.includes('watchdog.mjs'))!
    const serve = descendants(watchdog.pid).find(proc => / serve /.test(proc.cmdline))!
    expect(serve, run.output()).toBeDefined()
    const seen = environ(serve.pid)
    expect(seen.PRESMIUM_SERVICE_TOKEN).toMatch(/^\S{20,}$/)
    expect(Object.keys(seen).filter(name => /^(DEEPSEEK_|DSH_)/.test(name))).toEqual([])
    // A page of the service starts its site's dev server, a child of the service.
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
