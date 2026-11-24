import { run } from '@lincyaw/cli/testing'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanEnv, remove, temporary } from './helpers.ts'

describe('presmium-speech consent', () => {
  const SPEECH_BIN = fileURLToPath(new URL('../bin/presmium-speech.mjs', import.meta.url))
  let dir: string
  let operator: string

  beforeAll(() => {
    dir = temporary('speech-consent')
    operator = temporary('speech-consent-operator')
  })

  afterAll(() => remove(dir, operator))

  it('registers a consent record in the operator directory, and refuses one whose statement digest is no sha256', async () => {
    const record = { speaker: '林老师', scope: '课程讲授的合成', date: '2026-10-01', statementSha256: 'c'.repeat(64) }
    writeFileSync(join(dir, 'good.json'), JSON.stringify(record))
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ ...record, statementSha256: 'not-a-digest' }))
    const consent = (file: string) => run(process.execPath, [SPEECH_BIN, 'consent', 'fake', 'cloned-lin', file, '--operator-dir', operator], { cwd: dir, env: cleanEnv() })
    const file = join(operator, 'consent/fake/cloned-lin.json')

    const refused = await consent('bad.json')
    expect(refused.code).toBe(2)
    expect(refused.stderr).toContain('statementSha256 is not a sha256 in hex')
    expect(existsSync(file)).toBe(false)

    const registered = await consent('good.json')
    expect(registered.code, registered.stderr).toBe(0)
    expect(registered.stdout).toBe(`consent  ${file}\n`)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(record)
  }, 60_000)
})
