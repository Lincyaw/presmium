import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium, PRESMIUM_BIN } from '@lincyaw/cli/testing'
import type { CodeNode, IRDocument } from '@lincyaw/kernel'
import { afterAll, expect, it } from 'vitest'

const ADDON = fileURLToPath(new URL('..', import.meta.url))
const NOTEBOOK = fileURLToPath(new URL('../../render-notebook', import.meta.url))
const dirs: string[] = []
afterAll(() => dirs.forEach(dir => rmSync(dir, { recursive: true, force: true })))

const FENCE = '```'
const DECK = `---
plugins:
  - ${ADDON}
renderers:
  notebook:
    package: ${NOTEBOOK}
execute:
  environments:
    wasm: { kind: wasi, languages: [c] }
---

## WebAssembly

(sum)=
${FENCE}{code} c
:run:
#include <stdio.h>
#include <stdlib.h>

int main(void) {
  int sum = 0;
  for (int i = 1; i <= 10; i++) sum += i;
  printf("1 + 2 + ... + 10 = %d\\n", sum);
  const char *plain = getenv("FIXTURE_PLAIN"), *token = getenv("FIXTURE_API_TOKEN");
  printf("%s %s\\n", plain ? plain : "(none)", token ? token : "(none)");
  return 0;
}
${FENCE}

(vector)=
${FENCE}{code} cpp
:run:
#include <iostream>
#include <vector>

int main() {
  std::vector<int> v{3, 4, 5};
  int sum = 0;
  for (int x : v) sum += x * x;
  std::cout << "squares: " << sum << std::endl;
}
${FENCE}

(words)=
${FENCE}{code} ruby
:run:
puts %w[wasi ruby].map(&:upcase).join(" ")
${FENCE}

(query)=
${FENCE}{code} sql
:run:
create table t(x int);
insert into t values (1), (2), (3);
select sum(x) from t;
${FENCE}

(named)=
${FENCE}{code} c
:run:
:env: wasm
#include <stdio.h>
int main(void) { puts("in the environment"); return 0; }
${FENCE}
`

async function build(dir: string, path: string) {
  const result = await presmium(dir, ['build'], { PATH: path, FIXTURE_PLAIN: 'visible', FIXTURE_API_TOKEN: 'hidden' })
  expect(result.code, result.stdout + result.stderr).toBe(0)
  const doc = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
  const runs = Object.fromEntries(doc.sections.flatMap(s => s.blocks).map(block => [block.id, (block.node as CodeNode).outputs?.[0]]))
  const freeze = join(dir, '.presmium/freeze')
  const environments = readdirSync(freeze).filter(f => f.endsWith('.json')).map(f => (JSON.parse(readFileSync(join(freeze, f), 'utf8')) as { environment: string }).environment)
  return { runs, environments: [...new Set(environments)].sort(), log: /code runs: \d+ executed, \d+ from cache/.exec(result.stdout)?.[0] }
}

it('records C, C++, Ruby and SQL without a toolchain on the build machine, under the hash of the runtime binaries, the same in a second build', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-wasi-'))
  dirs.push(dir)
  const empty = join(dir, 'no-toolchain')
  mkdirSync(empty)
  for (const helper of ['fusermount3', 'fusermount']) {
    const found = spawnSync('sh', ['-c', `command -v ${helper}`], { encoding: 'utf8' }).stdout.trim()
    if (found) symlinkSync(found, join(empty, helper))
  }
  writeFileSync(join(dir, 'lecture.md'), DECK)

  const first = await build(dir, empty)
  expect(first.log).toBe('code runs: 5 executed, 0 from cache')
  expect(first.runs.sum).toMatchObject({ ok: true, exitCode: 0, executorId: 'presmium.wasi', stdout: '1 + 2 + ... + 10 = 55\nvisible (none)\n' })
  expect(first.runs.vector).toMatchObject({ ok: true, stdout: 'squares: 50\n' })
  expect(first.runs.words).toMatchObject({ ok: true, stdout: 'WASI RUBY\n' })
  expect(first.runs.query).toMatchObject({ ok: true, stdout: '6\n' })
  expect(first.runs.named).toMatchObject({ ok: true, executorId: 'presmium.env.wasm', stdout: 'in the environment\n' })
  expect(first.environments).toEqual([
    expect.stringMatching(/^wasi clang sha256:[0-9a-f]{16}$/),
    expect.stringMatching(/^wasi ruby sha256:[0-9a-f]{16}$/),
    expect.stringMatching(/^wasi sqlite sha256:[0-9a-f]{16}$/),
  ])

  rmSync(join(dir, '.presmium'), { recursive: true })
  rmSync(join(dir, 'dist'), { recursive: true })
  const second = await build(dir, empty)
  expect(second.log).toBe('code runs: 5 executed, 0 from cache')
  expect(second.environments).toEqual(first.environments)
  expect(second.runs.sum!.cacheKey).toBe(first.runs.sum!.cacheKey)
  expect(second.runs.sum!.stdout).toBe(first.runs.sum!.stdout)
}, 180_000)

function peakMemory(pid: number): number | undefined {
  try {
    const kb = /^VmHWM:\s+(\d+) kB$/m.exec(readFileSync(`/proc/${pid}/status`, 'utf8'))?.[1]
    if (!kb) throw new Error(`/proc/${pid}/status has no VmHWM measurement`)
    return Number(kb) / 1024
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined // The child exited between samples.
    throw error
  }
}

it('stops a program\'s memory at its limit, in a process of its own: the program fails, saying why, and the compiling process does not grow with it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-wasi-memory-'))
  dirs.push(dir)
  writeFileSync(join(dir, 'lecture.md'), `---
plugins:
  - ${ADDON}
---

## 内存

${FENCE}{code} c
:run:
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
  size_t total = 0, ones = 0;
  for (;;) {
    char *block = malloc(64 << 20);
    if (!block) {
      fprintf(stderr, "out of memory after %zu MiB\\n", total);
      return 1;
    }
    memset(block, 1, 64 << 20);
    ones += block[total];
    total += 64;
    if (total >= 3072) break;
  }
  printf("allocated %zu MiB, %zu ones\\n", total, ones);
  return 0;
}
${FENCE}
`)
  const { NODE_ENV: _test, ...env } = process.env
  const child = spawn(process.execPath, [PRESMIUM_BIN, 'ir', '--out', 'ir.json'], { cwd: dir, env, stdio: 'ignore' })
  let peak: number | undefined
  const sampler = process.platform === 'linux' ? setInterval(() => {
    const sample = peakMemory(child.pid!)
    if (sample !== undefined) peak = Math.max(peak ?? 0, sample)
  }, 20) : undefined
  const code = await new Promise<number | null>(done => child.once('exit', done))
  clearInterval(sampler)
  expect(code).toBe(0)
  const doc = JSON.parse(readFileSync(join(dir, 'ir.json'), 'utf8')) as IRDocument
  const run = (doc.sections[0]!.blocks[0]!.node as CodeNode).outputs![0]!
  expect(run).toMatchObject({ ok: false, exitCode: 1, stdout: '' })
  const failed = /^out of memory after (\d+) MiB\n$/.exec(run.stderr)
  expect(failed, run.stderr).not.toBeNull()
  expect(Number(failed![1])).toBeLessThan(1024)
  if (process.platform === 'linux') {
    expect(peak).toBeGreaterThan(0)
    expect(peak).toBeLessThan(1024)
  } else {
    console.info('Skipping compiler peak-memory measurement: Linux /proc/<pid>/status is required; the WASI allocation limit and failure output are still checked.')
  }
}, 120_000)
