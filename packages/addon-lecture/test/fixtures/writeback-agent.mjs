#!/usr/bin/env node
// The deterministic test agent of writing a lecture back (WP-84; P-136, P-137): a real ACP agent over stdio
// (@agentclientprotocol/sdk), started by the assistant as the operator's replacement runtime
// (PRESMIUM_AGENT_COMMAND). It does what the lecture panel's requests ask, through the Presmium MCP server
// it was given (`session/new`'s mcpServers), as a model would:
//
// - a `transcript` task (`track: <id>`): it calls track_narration, tidies each step's draft (drops the fillers
//   嗯 and 那个 with the comma after them) and writes it in place of that step's narration lines, or after
//   the block of `after` for a step without narration; the cue roles stay as the draft has them;
// - a chat that asks for track_translations: it calls the tool and writes each utterance's translation
//   (a small dictionary, else `<lang>: <text>`) with the source the tool gave into the track's line of that
//   utterance, keeping the file one utterance a line.
//
// Each file it writes is a tool call (`edit`) within its working directory, as DeepSeek Harness does. With
// WRITEBACK_AGENT_LOG it appends what it saw to that file, one JSON object a line.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Readable, Writable } from 'node:stream'
import * as acp from '@agentclientprotocol/sdk'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const LOG = process.env.WRITEBACK_AGENT_LOG
const log = (event, data = {}) => {
  if (LOG) appendFileSync(LOG, `${JSON.stringify({ event, ...data })}\n`)
}

/** The English translations the agent knows (of e2e/fixtures/lecture-writeback); others become `<lang>: <text>`. */
const DICTIONARY = {
  '嗯，我们先看这两行代码，': 'Well, first look at these two lines of code,',
  '合并出现最多的一对。': 'merge the pair that occurs most often.',
  '那个，词表随合并增长。': 'The vocabulary grows with each merge.',
}

const translated = (text, lang) => (lang === 'en' && DICTIONARY[text]) || `${lang}: ${text}`

const sessions = new Map()
let next = 0
let calls = 0

const say = (client, sessionId, text) => client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } })
const update = (client, sessionId, value) => client.notify(acp.methods.client.session.update, { sessionId, update: value })

/** Writes a file of the working directory as a tool call. */
async function edit(client, sessionId, cwd, path, content) {
  const file = resolve(cwd, path)
  const id = `edit-${++calls}`
  await update(client, sessionId, { sessionUpdate: 'tool_call', toolCallId: id, title: `edit ${path}`, kind: 'edit', status: 'pending', rawInput: { file_path: file }, locations: [{ path: file }] })
  writeFileSync(file, content)
  await update(client, sessionId, { sessionUpdate: 'tool_call_update', toolCallId: id, status: 'completed' })
}

/** Calls a tool of the Presmium MCP server, as a tool call of the agent; resolves with its JSON result. */
async function tool(client, sessionId, mcp, name, args) {
  const id = `mcp-${++calls}`
  await update(client, sessionId, { sessionUpdate: 'tool_call', toolCallId: id, title: `mcp__presmium__${name}`, kind: 'read', status: 'in_progress', rawInput: args })
  const result = await mcp.callTool({ name, arguments: args })
  await update(client, sessionId, { sessionUpdate: 'tool_call_update', toolCallId: id, status: result.isError ? 'failed' : 'completed' })
  const text = result.content?.[0]?.text ?? ''
  if (result.isError) throw new Error(`${name}: ${text}`)
  log('tool', { name, args, result: JSON.parse(text) })
  return JSON.parse(text)
}

async function mcpClient(servers) {
  const server = servers.find(s => s.type === 'http' || 'url' in s)
  if (!server) throw new Error('no MCP server')
  const client = new Client({ name: 'writeback-agent', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: Object.fromEntries((server.headers ?? []).map(h => [h.name, h.value])) } }))
  return client
}

/** The transcript as narration: each step's tidied draft in place of its narration, files edited from their last lines up. */
async function narrate(client, sessionId, cwd, mcp, track, document) {
  const draft = await tool(client, sessionId, mcp, 'track_narration', { track, ...document ? { document } : {} })
  const edits = new Map()
  for (const section of draft.sections) {
    for (const step of section.steps) {
      const text = step.draft.replace(/(?:嗯|那个)[，,]\s*/g, '')
      // The first paragraph becomes the text, the step's others go; without one, a new paragraph after the block.
      const changes = step.narration.length
        ? step.narration.map((p, i) => ({ file: p.file, from: p.startLine, to: p.endLine, lines: i === 0 ? [text] : [] }))
        : step.after ? [{ file: step.after.file, from: step.after.endLine + 1, to: step.after.endLine, lines: ['', text] }] : []
      for (const change of changes) edits.set(change.file, [...edits.get(change.file) ?? [], change])
    }
  }
  for (const [file, list] of edits) {
    const lines = readFileSync(resolve(cwd, file), 'utf8').split('\n')
    for (const e of list.sort((a, b) => b.from - a.from)) lines.splice(e.from - 1, e.to - e.from + 1, ...e.lines)
    await edit(client, sessionId, cwd, file, lines.join('\n'))
  }
  return `已把讲授 ${track} 的转写整理为 ${draft.sections.length} 节的讲解。`
}

/** The translations of a track's utterances, written into their lines of track.json. */
async function translate(client, sessionId, cwd, mcp, args, document) {
  const listed = await tool(client, sessionId, mcp, 'track_translations', { ...args, ...document ? { document } : {} })
  const items = new Map(listed.utterances.map(u => [u.id, u]))
  const lines = readFileSync(resolve(cwd, listed.file), 'utf8').split('\n').map((line) => {
    const match = /^(\s*)(\{"id":.*\})(,?)$/.exec(line)
    const utterance = match && JSON.parse(match[2])
    const item = utterance && items.get(utterance.id)
    if (!item) return line
    utterance.translations = { ...utterance.translations, [args.lang]: { text: translated(item.text, args.lang), source: item.source } }
    return `${match[1]}${JSON.stringify(utterance)}${match[3]}`
  })
  await edit(client, sessionId, cwd, listed.file, lines.join('\n'))
  return `已把讲授 ${args.track} 的 ${items.size} 句译成 ${args.lang}。`
}

const app = acp.agent({ name: 'writeback-agent' })
  .onRequest(acp.methods.agent.initialize, () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentInfo: { name: 'writeback-agent', title: 'Writeback Agent', version: '1.0.0' },
    agentCapabilities: { mcpCapabilities: { http: true }, sessionCapabilities: { close: {} } },
    authMethods: [],
  }))
  .onRequest(acp.methods.agent.session.new, ({ params }) => {
    const sessionId = `writeback-${process.pid}-${++next}`
    sessions.set(sessionId, { cwd: params.cwd, mcp: params.mcpServers ?? [] })
    return { sessionId }
  })
  .onNotification(acp.methods.agent.session.cancel, () => {})
  .onRequest(acp.methods.agent.session.close, ({ params }) => {
    sessions.delete(params.sessionId)
    return {}
  })
  .onRequest(acp.methods.agent.session.prompt, async ({ params, client }) => {
    const session = sessions.get(params.sessionId)
    const text = params.prompt.filter(block => block.type === 'text').map(block => block.text).join('\n')
    const context = JSON.parse(/^presmium-context: (.*)$/m.exec(text)?.[1] ?? '{}')
    const track = /^track: (\S+)/m.exec(text)?.[1]
    const translation = /track_translations[^{]*(\{[^}]*\})/.exec(text.split(/^Request:$/m).at(-1) ?? '')
    log('prompt', { text, context })
    const mcp = await mcpClient(session.mcp)
    try {
      const answer = track
        ? await narrate(client, params.sessionId, session.cwd, mcp, track, context.document)
        : translation
          ? await translate(client, params.sessionId, session.cwd, mcp, JSON.parse(translation[1]), context.document)
          : '这个测试 agent 只会整理讲授与生成译文。'
      await say(client, params.sessionId, answer)
    } catch (error) {
      log('error', { message: String(error) })
      await say(client, params.sessionId, `失败：${error}`)
    } finally {
      await mcp.close()
    }
    return { stopReason: 'end_turn' }
  })

app.connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)))
process.stdin.on('end', () => process.exit(0))
