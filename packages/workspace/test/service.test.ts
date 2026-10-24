import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CompileJob, JobsAnswer } from '@lincyaw/kernel'
import { connectPresmiumMcp } from '@lincyaw/mcp/client'
import type { Child } from './helpers.ts'
import { cleanEnv, FIXTURES, presmiumProcess, raw, remove, waitFor, workspace } from './helpers.ts'

const TOKEN = 'service-test-token'
const WORKBENCH = 'http://127.0.0.1:5617'
const ALL = { Authorization: `Bearer ${TOKEN}` }

async function events(url: string, until: (data: Record<string, unknown>) => boolean, act: () => void): Promise<Record<string, unknown>[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)
  const response = await fetch(url, { headers: ALL, signal: controller.signal })
  expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/)
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const seen: Record<string, unknown>[] = []
  let text = ''
  let acted = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
      let end
      while ((end = text.indexOf('\n\n')) >= 0) {
        const block = text.slice(0, end)
        text = text.slice(end + 2)
        const data = block.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).join('\n')
        if (!data) continue
        const event = JSON.parse(data) as Record<string, unknown>
        seen.push(event)
        if (until(event)) return seen
      }
      if (!acted && seen.length > 0) {
        acted = true
        act()
      }
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
  return seen
}

describe('presmium serve: the workspace service for a workbench', () => {
  let dir: string
  let home: string
  let serve: Child
  let url: string
  const route = (path: string, options: Parameters<typeof raw>[1] = {}) => raw(`${url}/__presmium/presmium.workspace/${path}`, { ...options, headers: { ...ALL, ...options.headers } })

  beforeAll(async () => {
    dir = workspace('service', join(FIXTURES, 'service'), { '@lincyaw/addon-assistant': 'packages/addon-assistant' })
    home = `${dir}.home`
    mkdirSync(home)
    serve = presmiumProcess(dir, ['serve', '--preview-origin', WORKBENCH, '--port', '0'], cleanEnv({ PRESMIUM_SERVICE_TOKEN: TOKEN, HOME: home, XDG_CACHE_HOME: join(home, 'cache'), XDG_STATE_HOME: join(home, 'state'), XDG_CONFIG_HOME: join(home, 'config') }))
    url = (await waitFor(serve, /^serve {2}(http\S+)$/m))[1]!
  }, 120_000)
  afterAll(async () => {
    await serve?.stop()
    remove(dir)
    remove(home)
  })

  it('gives the revision first to a workbench that asks for the events of a document nothing has compiled', async () => {
    const seen = await events(`${url}/__presmium/presmium.workspace/ir/events?document=fresh`, () => true, () => {})
    const { revision } = (await route('ir?document=fresh')).json<{ revision: string }>()
    expect(seen).toEqual([{ document: 'fresh', revision, diagnostics: { errors: 0, warnings: 0 }, files: [] }])
  }, 120_000)

  it('loads neither the workspace\'s nor the operator plugin\'s browser parts, and its home page is the documents\' cards', async () => {
    const config = (html: string) => JSON.parse(/<script type="application\/json" id="presmium-app">(.*?)<\/script>/s.exec(html)![1]!) as { kind: string, plugins?: string[], origins: string[], documents?: { dir: string }[] }
    const index = await raw(`${url}/`)
    expect(index.status).toBe(200)
    const home = config(index.text)
    expect(home.kind).toBe('home')
    expect(home.documents?.map(doc => doc.dir)).toContain('talk')
    expect(home.plugins ?? []).toEqual([])
    const talk = await raw(`${url}/talk/`)
    expect(talk.status).toBe(200)
    const page = config(talk.text)
    expect(page.kind).toBe('document')
    // The workspace's IR names each plugin by its directory.
    expect(page.plugins, JSON.stringify(page.plugins)).toEqual([expect.stringMatching(/[\\/]addon-core$/)])
    expect(page.origins).toEqual([WORKBENCH])
  }, 300_000)

  it('answers the IR with its revision, pushes the revision of a saved source, gives the previews\' addresses, builds outside the document and checks', async () => {
    const ir = await route('ir?document=talk')
    expect(ir.status, ir.text).toBe(200)
    const answer = ir.json<{ document: string, revision: string, doc: { meta: { entry: string }, sections: { id: string, source: { file: string } }[] }, diagnostics: { message: string, source?: { file: string } }[] }>()
    expect(answer.document).toBe('talk')
    expect(answer.revision).toMatch(/^[0-9a-f]{16}$/)
    expect(answer.doc.meta.entry).toBe('talk/lecture.md')
    expect(answer.doc.sections.map(s => s.id)).toEqual(['service-talk', 'first', 'second'])
    expect(answer.doc.sections[1]!.source.file).toBe('talk/lecture.md')
    expect(answer.diagnostics).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/unknown renderer id/), source: expect.objectContaining({ file: 'talk/lecture.md' }) }))

    const file = join(dir, 'talk/lecture.md')
    const seen = await events(`${url}/__presmium/presmium.workspace/ir/events?document=talk`, event => event.revision !== answer.revision, () => {
      writeFileSync(file, readFileSync(file, 'utf8').replace('The first section of the talk.', 'The first section, saved.'))
    })
    expect(seen[0]).toMatchObject({ document: 'talk', revision: answer.revision })
    const pushed = seen.at(-1)!
    expect(pushed).toMatchObject({ document: 'talk', files: ['talk/lecture.md'], diagnostics: { errors: 0, warnings: 1 } })
    expect(pushed.revision).not.toBe(answer.revision)
    await expect(route('ir?document=talk').then(r => r.json<{ revision: string }>().revision)).resolves.toBe(pushed.revision)

    const preview = await route('preview?document=talk')
    expect(preview.status, preview.text).toBe(200)
    expect(preview.json()).toEqual({ document: 'talk', web: `${url}/__app/view?document=talk`, slides: `${url}/__presmium/presmium.workspace/slides/talk/` })

    const build = await route('build?document=talk', { method: 'POST', json: { to: ['web'] } })
    expect(build.status, build.text).toBe(200)
    const outputs = build.json<{ outputs: { renderer: string, outDir: string }[] }>().outputs
    expect(outputs.map(o => o.renderer)).toEqual(['web'])
    expect(relative(dir, outputs[0]!.outDir)).toMatch(/^\.\./)
    const check = await route('check?document=talk', { method: 'POST' })
    expect(check.status, check.text).toBe(200)
    expect(check.json<{ findings: { message: string }[] }>().findings).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/unknown renderer id/) }))
  }, 600_000)

  it('asks every route of the workspace and the server\'s diagnostics for the service token, and refuses a token that differs only in a non-ASCII letter', async () => {
    for (const [path, init] of [['ir?document=talk', {}], ['documents', {}], ['files?document=talk', {}], ['source?document=talk', { method: 'POST', json: { path: 'talk/lecture.md', content: 'x', base: 'x' } }]] as const) {
      expect((await raw(`${url}/__presmium/presmium.workspace/${path}`, init)).status, path).toBe(401)
      expect((await raw(`${url}/__presmium/presmium.workspace/${path}`, { ...init, headers: { Authorization: 'Bearer another' } })).status, path).toBe(401)
    }
    const lookalike = { Authorization: `Bearer ${TOKEN.slice(0, -1)}é` }
    expect((await raw(`${url}/__presmium/presmium.workspace/documents`, { headers: lookalike })).status).toBe(401)
    expect((await raw(`${url}/__presmium/presmium.server/diagnostics?document=talk`, { headers: lookalike })).status).toBe(401)
    expect((await raw(`${url}/__presmium/presmium.server/diagnostics?document=talk`, { headers: ALL })).status).toBe(200)
    expect((await route('documents')).status).toBe(200)
    expect((await raw(`${url}/__presmium/presmium.server/hello`)).status).toBe(200)
  })

  it('lets only the workbench frame the previews', async () => {
    const preview = (await route('preview?document=talk')).json<{ web: string, slides: string }>()
    for (const page of [preview.web, preview.slides]) {
      const answer = await raw(page)
      expect(answer.status, page).toBe(200)
      expect(answer.headers['content-security-policy'], page).toBe(`frame-ancestors ${WORKBENCH}`)
    }
  }, 300_000)

  it('makes a document into its outputs as jobs: the files below /__outputs/, a revision made once, the same jobs for the AI', async () => {
    const answer = (await route('jobs?document=talk')).json<JobsAnswer>()
    expect(answer.targets.map(target => target.id)).toContain('web')
    const started = await route('jobs?document=talk', { method: 'POST', json: { target: 'web' } })
    expect(started.status, started.text).toBe(200)
    const { id } = started.json<CompileJob>()
    let job = started.json<CompileJob>()
    for (const until = Date.now() + 300_000; job.state === 'queued' || job.state === 'running';) {
      if (Date.now() > until) throw new Error(`the job is still ${job.state}`)
      await new Promise(done => setTimeout(done, 500))
      job = (await route('jobs?document=talk')).json<JobsAnswer>().jobs.find(own => own.id === id)!
    }
    expect(job, job.error).toMatchObject({ state: 'done', target: 'web', main: 'web/index.html' })
    // The site is built for the job's address: its pages and their assets load from there.
    const page = await raw(`${job.url}${job.main}`)
    expect(page.status).toBe(200)
    expect(page.text).toContain(`/__outputs/${id}/web/`)
    expect(job.files.find(file => file.path === 'web/index.html')?.type).toBe('text/html')
    // The same revision is not made again.
    expect((await route('jobs?document=talk', { method: 'POST', json: { target: 'web' } })).json<CompileJob>().id).toBe(id)

    const { token } = JSON.parse(readFileSync(join(home, 'cache/presmium/serve', serveState(), 'server.json'), 'utf8')) as { token: string }
    const client = await connectPresmiumMcp(`${url}/mcp`, token)
    try {
      const called = await client.call('get_builds', { document: 'talk' })
      expect(called.isError, called.text).toBe(false)
      const builds = JSON.parse(called.text) as { targets: { id: string }[], jobs: { id: string, state: string, main?: string }[] }
      expect(builds.targets.map(target => target.id)).toContain('web')
      expect(builds.jobs[0]).toMatchObject({ id, state: 'done', main: `${job.url}web/index.html` })
    } finally {
      await client.close()
    }
  }, 600_000)

  function serveState(): string {
    const state = /its token is in (\S+)\/server\.json/.exec(serve.output())?.[1]
    if (!state) throw new Error(`no state directory in:\n${serve.output()}`)
    return state.split('/').at(-1)!
  }
})
