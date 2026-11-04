// Generate the voiceover of a document through Presmium's author actions: the same voiceover job the studio's
// Video Production starts, over the MCP relay of the `presmium serve` running for this workspace (tools/mcp.mjs).
// Only sentences without exact cached audio are synthesized; the audio lands in `<document>/.presmium/speech/`
// with its lock, which is committed with the document so builds and exports need no engine.
//
//   node tools/voiceover.mjs <document> [--wait] [--dry-run]
//   node tools/voiceover.mjs hinted-scaling-laws --wait
//
// The engine is the workspace's own (tools/env.sh defines the Edge engine, which is free). `--dry-run` prints the
// engine, the voice and what is missing without starting anything; `--wait` follows the job until it ends.
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { call, connect, WORKSPACE } from './mcp.mjs'

const args = process.argv.slice(2)
const document = args.find(a => !a.startsWith('--'))
if (!document) {
  console.error('usage: node tools/voiceover.mjs <document> [--wait] [--dry-run]')
  process.exit(2)
}
const wait = args.includes('--wait'), dry = args.includes('--dry-run')

// The voice the document asks for, for the report (the service resolves it per step; this is the default).
const doc = JSON.parse(readFileSync(join(WORKSPACE, document, 'lecture.json'), 'utf8'))
const voice = doc.production?.defaults?.voiceSource?.voice

const client = await connect()
try {
  const { value: caps } = await call(client, 'get_voice_authoring_capabilities', { document })
  if (!caps.voiceover || !caps.actions?.start) throw new Error(`this service cannot generate voiceover (status ${caps.status}); start presmium serve with tools/env.sh and --allow spend`)
  const { value: status } = await call(client, 'get_voiceover_status', { document })
  const missing = status.steps.filter(s => s.state === 'missing')
  const sentences = missing.reduce((n, s) => n + (s.utterances - s.cached), 0)
  const blocked = status.steps.filter(s => s.state === 'blocked')
  console.log(`engine   ${caps.defaultEngine} (${caps.engines.map(e => `${e.id}: ${e.provider}`).join(', ')})`)
  console.log(`voice    ${voice ? `${voice.engine ?? caps.defaultEngine} ${voice.voice}${voice.rate ? ` rate ${voice.rate}` : ''}` : 'unset'}`)
  console.log(`steps    ${status.steps.length}: ${status.steps.filter(s => s.state === 'ready').length} ready, ${missing.length} missing, ${blocked.length} blocked`)
  for (const s of blocked) console.log(`  blocked ${s.stepId ?? `${s.target.section}/${s.target.step}`}: ${s.reason ?? ''}`)
  if (!sentences) { console.log('nothing to synthesize: every sentence has its exact audio'); process.exitCode = blocked.length ? 1 : 0 }
  else if (dry) console.log(`would synthesize ${sentences} sentences of ${missing.length} steps`)
  else {
    console.log(`synthesizing ${sentences} sentences of ${missing.length} steps`)
    const intent = randomBytes(18).toString('base64url').slice(0, 24)
    const request = { intent, source: status.source, revision: status.revision, scope: { kind: 'document' } }
    const { value: job } = await call(client, 'start_voiceover', { document, request })
    console.log(`job      ${job.id} (${job.state}, ${job.total} sentences)`)
    if (wait) {
      let last = ''
      for (;;) {
        const { value: seen } = await call(client, 'get_voiceover_job', { document, query: { id: job.id } })
        const now = seen.job ?? seen
        const line = `${now.state} ${now.completed}/${now.total}${now.failed ? `, ${now.failed} failed` : ''}`
        if (line !== last) console.log(`  ${line}`), last = line
        if (['done', 'failed', 'cancelled', 'stale'].includes(now.state)) {
          if (now.error) console.log(`  error: ${now.error}`)
          if (now.state !== 'done' || now.failed) process.exitCode = 1
          break
        }
        await new Promise(r => setTimeout(r, 1500))
      }
    }
  }
} finally {
  await client.close()
}
