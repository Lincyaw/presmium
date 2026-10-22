import { spawn, spawnSync } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PRESMIUM_BIN } from '@lincyaw/cli/testing'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { imageName } from '../src/node/container.ts'

const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const IMAGE = 'python:3.12-alpine'
const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], { stdio: 'ignore' }).status === 0

const WORK = fileURLToPath(new URL('../../../e2e/fixtures/regression/.presmium', import.meta.url))
const SCRATCH = join(WORK, `local-documents-${process.pid}`)
const ROOT = join(SCRATCH, 'workspace')
let serve: ChildProcess | undefined
let output = ''

function document(name: string): void {
  mkdirSync(join(ROOT, name, '.devcontainer'), { recursive: true })
  writeFileSync(join(ROOT, name, '.devcontainer/devcontainer.json'), `${JSON.stringify({ image: IMAGE, containerEnv: { DOCUMENT: name } })}\n`)
  writeFileSync(join(ROOT, name, 'lecture.md'), `---
title: ${name}
plugins:
  - ${PACKAGE}
presmium:
  presmium.execLocal: { workspace: . }
---

## where

(where)=
\`\`\`{code} python
:run:
:executor: presmium.container
import os
print(os.environ["DOCUMENT"])
\`\`\`
`)
}

function waitFor(pattern: RegExp): Promise<RegExpExecArray> {
  return new Promise((resolve, reject) => {
    const check = () => {
      const match = pattern.exec(output)
      if (match) resolve(match)
    }
    serve!.stdout!.on('data', check)
    serve!.stderr!.on('data', check)
    serve!.once('exit', code => reject(new Error(`presmium serve exited (${code}):\n${output}`)))
    check()
  })
}

async function callTool(endpoint: string, token: string, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  })
  const text = await response.text()
  const message = text.trimStart().startsWith('{') ? text : text.split('\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6)).at(-1)!
  const { result } = JSON.parse(message) as { result: { isError?: boolean, content: { text: string }[] } }
  if (result.isError) throw new Error(`${name}: ${result.content[0]!.text}`)
  return JSON.parse(result.content[0]!.text) as Record<string, unknown>
}

beforeAll(() => {
  mkdirSync(ROOT, { recursive: true })
  writeFileSync(join(ROOT, 'presmium.workspace.yaml'), 'approvals:\n  operate: allow\n')
  document('a')
  document('b')
})

afterAll(async () => {
  if (serve && serve.exitCode === null) {
    const exited = new Promise(done => serve!.once('exit', done))
    serve.kill('SIGTERM')
    await exited
  }
  if (docker) spawnSync('docker', ['image', 'rm', '--force', imageName(join(ROOT, 'a')), imageName(join(ROOT, 'b'))], { stdio: 'ignore' })
  rmSync(SCRATCH, { recursive: true, force: true })
}, 60_000)

it.skipIf(!docker)('runs a block of each document of a workspace in that document\'s own workspace, whichever document compiled last', async () => {
  const { NODE_ENV: _test, ...env } = process.env
  serve = spawn(process.execPath, [PRESMIUM_BIN, 'serve', '--port', '0'], { cwd: ROOT, env: { ...env, XDG_CACHE_HOME: join(SCRATCH, 'cache') }, stdio: ['ignore', 'pipe', 'pipe'] })
  serve.stdout!.on('data', (chunk: Buffer) => output += chunk)
  serve.stderr!.on('data', (chunk: Buffer) => output += chunk)
  const [, endpoint, stateFile] = await waitFor(/^mcp {2}(http:\/\/127\.0\.0\.1:\d+\/mcp) \(its token is in (.+)\)$/m)
  const { token } = JSON.parse(readFileSync(stateFile!, 'utf8')) as { token: string }

  const sections = await callTool(endpoint!, token, 'list_sections', { document: 'a' }) as { sections: { id: string }[] }
  await callTool(endpoint!, token, 'list_sections', { document: 'b' })
  const ran = await callTool(endpoint!, token, 'run_code', { document: 'a', section: sections.sections[0]!.id, block: 'where' })
  expect(ran).toMatchObject({ ok: true, stdout: 'a\n' })
}, 600_000)
