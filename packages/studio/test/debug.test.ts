import { fileURLToPath } from 'node:url'
import { run } from '@lincyaw/cli/testing'
import { expect, it } from 'vitest'

it('captures early browser and frame failures, HTTP errors, long tasks and pending requests beside service logs without tokens', async () => {
  const probe = fileURLToPath(new URL('../../../e2e/fixtures/debug-browser/probe.mjs', import.meta.url))
  const result = await run(process.execPath, [probe])
  expect(result.code, result.stdout + result.stderr).toBe(0)
  const { summary, events } = JSON.parse(result.stdout)
  expect(summary.counts['browser.error']).toBeGreaterThanOrEqual(3)
  expect(summary.counts['http.error']).toBeGreaterThanOrEqual(2)
  expect(summary.counts['browser.longtask']).toBeGreaterThan(0)
  expect(summary.counts['request.slow']).toBeGreaterThan(0)
  expect(events).toContain('frame startup failed')
  expect(events).toContain('unhandled promise failed')
  expect(events).toContain('startup failed')
  expect(events).toContain('backend.log')
  expect(events).toContain('/pending')
  expect(events).not.toContain('private-secret')
  expect(events).not.toContain('?token=')
}, 30_000)
