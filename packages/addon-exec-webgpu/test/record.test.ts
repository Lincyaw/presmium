// Compile-time recording of a WGSL compute shader (P-104, WP-75), with the real `presmium build`: the
// run panel's shader runs in Playwright's Chromium on SwiftShader (the environment's `adapter`), so
// any machine records the same; the recording's environment fingerprint names the browser and the
// fallback adapter, and its timing is marked as CPU emulation. The summary is in the deck's language
// (`RunContext.lang`; the deck has none, so zh-CN).
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import type { CodeNode, ComponentNode, IRDocument } from '@presmium/kernel'
import { afterAll, expect, it } from 'vitest'

const WEBGPU = fileURLToPath(new URL('..', import.meta.url))
const EXEC = fileURLToPath(new URL('../../addon-exec', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

const DECK = `---
plugins:
  - ${EXEC}
  - ${WEBGPU}
execute:
  environments:
    cpu: { kind: webgpu, adapter: swiftshader }
renderers:
  notebook:
    package: ${NOTEBOOK}
---

## 向量加法

\`\`\`{run-panel} wgsl
:env: cpu
:params: {buffers: {a: [1, 2, 3, 4], b: [10, 20, 30, 40], out: {size: 4}}, repeat: 3}
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> out: array<f32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < arrayLength(&out)) {
    out[id.x] = a[id.x] + b[id.x];
  }
}
\`\`\`
`

it('records the shader\'s output in Chromium on SwiftShader, in the deck\'s language, with a fingerprint that names the fallback adapter', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-webgpu-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'lecture.md'), DECK)
  const result = await presmium(dir, ['build'])
  expect(result.code, result.stdout + result.stderr).toBe(0)
  expect(result.stdout).toContain('code runs: 1 executed, 0 from cache')

  const doc = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
  const panel = doc.sections[0]!.blocks[0]!.node as ComponentNode
  const run = (panel.children![0]!.node as CodeNode).outputs![0]!
  expect(run).toMatchObject({ ok: true, executorId: 'presmium.env.cpu' })
  expect(run.stdout).toMatch(/^out: f32\[4\] = \[11, 22, 33, 44\]\n计时：每次派发 [\d.e-]+ ms（3 次的中位数；GPU 时间戳；CPU 模拟）\n适配器：google swiftshader（回退适配器）\n$/)

  const freeze = join(dir, '.presmium/freeze')
  const records = readdirSync(freeze).filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(join(freeze, file), 'utf8')) as { environment: string })
  expect(records).toHaveLength(1)
  expect(records[0]!.environment).toMatch(/^chromium [\d.]+; google swiftshader \(fallback\)$/)
}, 180_000)
