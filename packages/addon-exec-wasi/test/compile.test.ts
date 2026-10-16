// Compile-time execution on the WASI binaries (P-103, WP-74), with the real `presmium build` on a
// machine without a toolchain: the build's PATH is an empty directory, so no cc, ruby or sqlite3
// can run, yet the C program (and the C++, Ruby and SQL blocks) are recorded. The recording names
// the runtime by the hash of its binaries, which a second build from scratch computes alike. The
// program's environment is the build's, cleaned of credentials (docs/architecture.md 10.6).
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { presmium } from '@presmium/cli/testing'
import type { CodeNode, IRDocument } from '@presmium/kernel'
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

/** Builds the deck in `dir` with the build machine's PATH an empty directory; the outputs by block, and the recordings' fingerprints. */
async function build(dir: string, path: string) {
  const result = await presmium(dir, ['build'], { PATH: path, FIXTURE_PLAIN: 'visible', FIXTURE_API_TOKEN: 'hidden' })
  expect(result.code, result.stdout + result.stderr).toBe(0)
  const doc = JSON.parse(readFileSync(join(dir, 'dist/ir.json'), 'utf8')) as IRDocument
  const runs = Object.fromEntries(doc.sections.flatMap(s => s.blocks).map(block => [block.id, (block.node as CodeNode).outputs?.[0]]))
  const freeze = join(dir, '.presmium/freeze')
  const environments = readdirSync(freeze).filter(f => f.endsWith('.json')).map(f => (JSON.parse(readFileSync(join(freeze, f), 'utf8')) as { environment: string }).environment)
  return { runs, environments: [...new Set(environments)].sort(), log: /code runs: .*/.exec(result.stdout)?.[0] }
}

it('records C, C++, Ruby and SQL without a toolchain on the build machine, under the hash of the runtime binaries, the same in a second build', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'presmium-wasi-'))
  dirs.push(dir)
  const empty = join(dir, 'no-toolchain')
  mkdirSync(empty)
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

  // From scratch: the same fingerprints, so the same cache keys.
  rmSync(join(dir, '.presmium'), { recursive: true })
  rmSync(join(dir, 'dist'), { recursive: true })
  const second = await build(dir, empty)
  expect(second.log).toBe('code runs: 5 executed, 0 from cache')
  expect(second.environments).toEqual(first.environments)
  expect(second.runs.sum!.cacheKey).toBe(first.runs.sum!.cacheKey)
  expect(second.runs.sum!.stdout).toBe(first.runs.sum!.stdout)
})
