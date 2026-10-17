// A Messages-compatible model service in the compose layout of the deploy test (the operator's
// PRESMIUM_MODEL_URL, reached by the gateway only): each `POST /v1/messages` gets the next step of the
// script the test wrote to /script/steps.json (`{ round, steps }`; a new round starts from its first
// step), as an SSE stream: a text, or a tool call, after the step's `delayMs`. It records the keys it was sent in /script/keys.txt.
// Not a mock of DeepSeek Harness: the real one talks to it through the gateway, as it would to a model.
import { appendFileSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'

const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`

function stream(step, n) {
  const start = { type: 'message_start', message: { id: `msg_${n}`, type: 'message', role: 'assistant', model: 'fake-model', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }
  const block = 'text' in step
    ? [event('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }), event('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: step.text } })]
    : [event('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: `toolu_${n}`, name: step.tool, input: {} } }), event('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: JSON.stringify(step.input) } })]
  return [
    event('message_start', start),
    ...block,
    event('content_block_stop', { type: 'content_block_stop', index: 0 }),
    event('message_delta', { type: 'message_delta', delta: { stop_reason: 'text' in step ? 'end_turn' : 'tool_use', stop_sequence: null }, usage: { output_tokens: 5 } }),
    event('message_stop', { type: 'message_stop' }),
  ].join('')
}

let round
let n = 0
createServer((req, res) => {
  req.resume()
  req.on('end', () => {
    if (req.method !== 'POST' || !(req.url ?? '').endsWith('/v1/messages')) {
      res.writeHead(404).end()
      return
    }
    appendFileSync('/script/keys.txt', `${req.headers['x-api-key'] ?? req.headers.authorization ?? ''}\n`)
    let script = { round: '', steps: [] }
    try {
      script = JSON.parse(readFileSync('/script/steps.json', 'utf8'))
    } catch {
      // No script yet: the model just answers.
    }
    if (script.round !== round) {
      round = script.round
      n = 0
    }
    n++
    // A step may wait before it answers (`delayMs`): the agent's process meanwhile waits for its model.
    const step = script.steps[n - 1] ?? { text: '完毕。' }
    setTimeout(() => res.writeHead(200, { 'Content-Type': 'text/event-stream' }).end(stream(step, n)), step.delayMs ?? 0)
  })
}).listen(8000, '0.0.0.0')
