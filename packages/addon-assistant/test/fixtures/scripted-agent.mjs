#!/usr/bin/env node
// The deterministic test agent (WP-80): a real ACP agent over stdio (@agentclientprotocol/sdk), started by
// the assistant as a replacement runtime (PRESMIUM_AGENT_COMMAND, PRESMIUM_AGENT_TUTOR_COMMAND). What it
// does follows the question:
//
// - by default it lists the tools of the Presmium MCP server it was given (`session/new`'s mcpServers),
//   calls get_section for the section of the context (or the one `#cite <section>` names) and answers
//   with a citation of it;
// - `#wait`: it waits until the client sends `session/cancel`;
// - `#write <file>`: it asks permission to write <file> (relative to its working directory) and writes
//   it if allowed, then says what it was told.
//
// With SCRIPTED_AGENT_LOG it appends what it saw to that file, one JSON object a line: its environment,
// `session/new`'s parameters, the tools it listed, the permission outcomes, `session/cancel`.
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable, Writable } from 'node:stream'
import * as acp from '@agentclientprotocol/sdk'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const LOG = process.env.SCRIPTED_AGENT_LOG
const log = (event, data = {}) => {
  if (LOG) appendFileSync(LOG, `${JSON.stringify({ event, pid: process.pid, ...data })}\n`)
}
log('start', { env: process.env })

/** Sessions by id: their directory, MCP servers, and the cancellation of the running prompt. */
const sessions = new Map()
let next = 0

/** The question and the context line of a prompt. */
function readPrompt(prompt) {
  const text = prompt.filter(block => block.type === 'text').map(block => block.text).join('\n')
  const context = /^presmium-context: (.*)$/m.exec(text)
  const question = text.split(/^(?:Question|Request):\n/m).at(-1) ?? ''
  return { text, question: question.trim(), context: context ? JSON.parse(context[1]) : {} }
}

async function mcpClient(server) {
  const headers = Object.fromEntries((server.headers ?? []).map(h => [h.name, h.value]))
  const client = new Client({ name: 'scripted-agent', version: '1.0.0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers } }))
  return client
}

const say = (client, sessionId, text) => client.notify(acp.methods.client.session.update, { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } })
const tool = (client, sessionId, update) => client.notify(acp.methods.client.session.update, { sessionId, update })

const app = acp.agent({ name: 'scripted-agent' })
  .onRequest(acp.methods.agent.initialize, () => ({
    protocolVersion: acp.PROTOCOL_VERSION,
    agentInfo: { name: 'scripted-agent', title: 'Scripted Agent', version: '1.0.0' },
    agentCapabilities: { mcpCapabilities: { http: true }, sessionCapabilities: { close: {} } },
    authMethods: [],
  }))
  .onRequest(acp.methods.agent.session.new, ({ params }) => {
    const sessionId = `scripted-${process.pid}-${++next}`
    sessions.set(sessionId, { cwd: params.cwd, mcp: params.mcpServers ?? [] })
    log('session/new', { cwd: params.cwd, mcpServers: params.mcpServers })
    return { sessionId }
  })
  .onNotification(acp.methods.agent.session.cancel, ({ params }) => {
    log('session/cancel', { sessionId: params.sessionId })
    sessions.get(params.sessionId)?.cancel?.()
  })
  .onRequest(acp.methods.agent.session.close, ({ params }) => {
    log('session/close', { sessionId: params.sessionId })
    sessions.delete(params.sessionId)
    return {}
  })
  .onRequest(acp.methods.agent.session.prompt, async ({ params, client }) => {
    const session = sessions.get(params.sessionId)
    const { question, context } = readPrompt(params.prompt)
    log('session/prompt', { question, context })

    if (question.includes('#wait')) {
      await say(client, params.sessionId, '让我想一想……')
      await new Promise(resolve => session.cancel = resolve)
      return { stopReason: 'cancelled' }
    }

    const write = /#write (\S+)/.exec(question)
    if (write) {
      const file = join(session.cwd, write[1])
      await tool(client, params.sessionId, { sessionUpdate: 'tool_call', toolCallId: 'write-1', title: 'write', kind: 'edit', status: 'pending', rawInput: { file_path: file, content: 'written by the agent\n' }, locations: [{ path: file }] })
      const answer = await client.request(acp.methods.client.session.requestPermission, {
        sessionId: params.sessionId,
        toolCall: { toolCallId: 'write-1' },
        options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }, { optionId: 'reject', name: 'Reject', kind: 'reject_once' }],
      })
      const allowed = answer.outcome.outcome === 'selected' && answer.outcome.optionId === 'allow'
      log('permission', { allowed, outcome: answer.outcome })
      if (allowed) writeFileSync(file, 'written by the agent\n')
      await tool(client, params.sessionId, { sessionUpdate: 'tool_call_update', toolCallId: 'write-1', status: allowed ? 'completed' : 'failed' })
      await say(client, params.sessionId, allowed ? 'permission: allowed' : 'permission: rejected')
      return { stopReason: 'end_turn' }
    }

    // Read the section through Presmium's MCP server, then cite it.
    const server = session.mcp.find(s => s.type === 'http' || 'url' in s)
    if (!server) {
      await say(client, params.sessionId, 'no MCP server')
      return { stopReason: 'end_turn' }
    }
    const mcp = await mcpClient(server)
    try {
      const { tools } = await mcp.listTools()
      log('tools', { names: tools.map(t => t.name) })
      const sections = JSON.parse((await mcp.callTool({ name: 'list_sections', arguments: {} })).content[0].text).sections
      const id = /#cite (\S+)/.exec(question)?.[1] ?? context.section ?? sections[0].id
      await tool(client, params.sessionId, { sessionUpdate: 'tool_call', toolCallId: 'get-1', title: 'mcp__presmium__get_section', kind: 'read', status: 'in_progress', rawInput: { section: id } })
      const section = JSON.parse((await mcp.callTool({ name: 'get_section', arguments: { section: id } })).content[0].text)
      await tool(client, params.sessionId, { sessionUpdate: 'tool_call_update', toolCallId: 'get-1', status: 'completed' })
      const title = section.title ?? sections.find(s => s.id === id)?.title ?? id
      await say(client, params.sessionId, `这段代码在[${title}](presmium://sections/${encodeURIComponent(id)})中讲解：问题是「${question}」。`)
    } finally {
      await mcp.close()
    }
    return { stopReason: 'end_turn' }
  })

app.connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)))
process.stdin.on('end', () => process.exit(0))
