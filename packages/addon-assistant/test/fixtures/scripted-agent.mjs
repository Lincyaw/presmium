#!/usr/bin/env node
// The deterministic test agent (WP-80): a real ACP agent over stdio (@agentclientprotocol/sdk), started by
// the assistant as a replacement runtime (PRESMIUM_AGENT_COMMAND). What it does follows the request:
//
// - `#read`: it lists the tools of the Presmium MCP server it was given (`session/new`'s mcpServers),
//   calls get_section for the section of the context (or the one `#cite <section>` names) and answers
//   with a citation of it;
// - `#wait`: it waits until the client sends `session/cancel`;
// - `#write <file>`: it asks permission to write <file> (relative to its working directory) and writes
//   it if allowed, then says what it was told.
//
// Otherwise a change task (WP-81) edits the files of its working directory, each write a tool call
// (`edit`), as DeepSeek Harness does: within the directory without asking, outside it (by its real path: a
// link in the directory to another one leads outside) after a permission request.
//
// - annotations (`presmium-annotations:`): each annotated block's lines become the annotation's request,
//   and the answer ends with a `presmium-annotation <id>: …` line for each;
// - `#append <path> <text…>` (one a line): appends the text to the file (created if missing); a line
//   `#sleep <ms>` between two waits that long (the assistant records the step of the first meanwhile);
//   a line `#build <renderer,…>` builds the deck through Presmium's MCP (`build`), a tool call of its own;
// - a message with 新增一节: a new section at the end of the chapter the context's section lies in;
// - a chat whose context names only the document (drafting): lecture.md is written in full, its
//   headmatter kept;
// - a transcript (`track: <id>`): the narration of the first section becomes the text of the track's
//   speech segments.
//
// With SCRIPTED_AGENT_LOG it appends what it saw to that file, one JSON object a line: its environment,
// `session/new`'s parameters, the tools it listed, the permission outcomes, `session/cancel`.
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
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

/** The question and the context line of a prompt; a change task's annotations and lecture track. */
function readPrompt(prompt) {
  const text = prompt.filter(block => block.type === 'text').map(block => block.text).join('\n')
  const context = /^presmium-context: (.*)$/m.exec(text)
  const annotations = /^presmium-annotations: (.*)$/m.exec(text)
  const track = /^track: (\S+)/m.exec(text)
  const question = text.split(/^(?:Question|Request):\n/m).at(-1) ?? ''
  return {
    text,
    question: question.trim(),
    context: context ? JSON.parse(context[1]) : {},
    change: /^Request:$/m.test(text),
    annotations: annotations ? JSON.parse(annotations[1]) : undefined,
    track: track?.[1],
  }
}

let calls = 0

/** A path's real path: its nearest existing ancestor's, links resolved, and the rest after it. */
function real(path) {
  let rest = ''
  for (let at = resolve(path); ; at = dirname(at)) {
    try {
      return join(realpathSync(at), rest)
    } catch {
      if (dirname(at) === at) return resolve(path)
      rest = join(basename(at), rest)
    }
  }
}

/** Writes a file as a tool call of the agent: within the working directory at once, outside it once the client allows it. */
async function edit(client, sessionId, cwd, path, content) {
  const file = resolve(cwd, path)
  const id = `edit-${++calls}`
  await tool(client, sessionId, { sessionUpdate: 'tool_call', toolCallId: id, title: `edit ${path}`, kind: 'edit', status: 'pending', rawInput: { file_path: file }, locations: [{ path: file }] })
  const rel = relative(real(cwd), real(file))
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    const answer = await client.request(acp.methods.client.session.requestPermission, {
      sessionId,
      toolCall: { toolCallId: id },
      options: [{ optionId: 'allow', name: 'Allow once', kind: 'allow_once' }, { optionId: 'reject', name: 'Reject', kind: 'reject_once' }],
    })
    const allowed = answer.outcome.outcome === 'selected' && answer.outcome.optionId === 'allow'
    log('permission', { allowed, outcome: answer.outcome, file })
    if (!allowed) {
      await tool(client, sessionId, { sessionUpdate: 'tool_call_update', toolCallId: id, status: 'failed' })
      return false
    }
  }
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, content)
  await tool(client, sessionId, { sessionUpdate: 'tool_call_update', toolCallId: id, status: 'completed' })
  return true
}

const read = (cwd, path) => (existsSync(resolve(cwd, path)) ? readFileSync(resolve(cwd, path), 'utf8') : '')

/** Builds the deck through the session's MCP server (`build`), as a tool call; logs what it answered. */
async function build(client, sessionId, servers, renderers) {
  const id = `build-${++calls}`
  await tool(client, sessionId, { sessionUpdate: 'tool_call', toolCallId: id, title: 'mcp__presmium__build', kind: 'other', status: 'in_progress', rawInput: { to: renderers } })
  const mcp = await mcpClient(servers.find(s => s.type === 'http' || 'url' in s))
  try {
    const result = await mcp.callTool({ name: 'build', arguments: { to: renderers } })
    log('build', { result: result.content?.[0]?.text, isError: Boolean(result.isError) })
  } finally {
    await mcp.close()
  }
  await tool(client, sessionId, { sessionUpdate: 'tool_call_update', toolCallId: id, status: 'completed' })
}

/** A change task: what the prompt asks, done in the working directory; resolves with the answer. */
async function change(client, sessionId, { cwd, mcp }, { question, context, annotations, track }) {
  if (annotations) {
    const notes = []
    // From the last lines up, so the earlier annotations' lines stay where they were.
    for (const a of [...annotations].sort((x, y) => x.file === y.file ? y.startLine - x.startLine : x.file.localeCompare(y.file))) {
      const lines = read(cwd, a.file).split('\n')
      lines.splice(a.startLine - 1, a.endLine - a.startLine + 1, ...a.request.split('\n'))
      await edit(client, sessionId, cwd, a.file, lines.join('\n'))
      notes.push(`presmium-annotation ${a.id}: 已把 ${a.file} 第 ${a.startLine} 行起改写为「${a.request}」`)
    }
    return `已处理 ${annotations.length} 条批注。\n${notes.reverse().join('\n')}`
  }
  if (track) {
    const speech = [...read(cwd, `lectures/${track}/track.json`).matchAll(/"text":\s*"([^"]*)"/g)].map(m => m[1]).join('')
    const lines = read(cwd, 'lecture.md').split('\n')
    const heading = lines.findIndex(line => line.startsWith('## '))
    let start = heading + 1
    while (start < lines.length && !lines[start].trim()) start++
    let end = start
    while (end < lines.length && lines[end].trim()) end++
    lines.splice(start, end - start, `据讲授轨 ${track} 整理的讲解：${speech}`)
    await edit(client, sessionId, cwd, 'lecture.md', lines.join('\n'))
    return `已把讲授轨 ${track} 的转写整理为第一节的讲解。`
  }
  const done = []
  for (const [, command, path, text] of question.matchAll(/^#(append|sleep|build) (\S+) ?(.*)$/gm)) {
    if (command === 'sleep') {
      await new Promise(resolve => setTimeout(resolve, Number(path)))
      continue
    }
    if (command === 'build') {
      await build(client, sessionId, mcp, path.split(','))
      done.push(`built ${path}`)
      continue
    }
    const ok = await edit(client, sessionId, cwd, path, `${read(cwd, path)}${text}\n`)
    done.push(ok ? `appended to ${path}` : `permission: rejected (${path})`)
  }
  if (question.includes('新增一节')) {
    const lines = read(cwd, 'lecture.md').split('\n')
    const from = context.source?.startLine ?? 1
    let at = lines.findIndex((line, i) => i >= from && /^# /.test(line))
    if (at < 0) at = lines.length
    lines.splice(at, 0, '## agent 新增的一节', '', '这一节由 agent 按对话新增。', '')
    await edit(client, sessionId, cwd, 'lecture.md', lines.join('\n'))
    done.push('在本章末尾新增了一节「agent 新增的一节」')
  }
  if (!context.section && !context.selection && done.length === 0) {
    const old = read(cwd, 'lecture.md')
    const head = /^---\n[\s\S]*?\n---\n/.exec(old)?.[0] ?? ''
    await edit(client, sessionId, cwd, 'lecture.md', `${head}\n# 初稿\n\n## 上下文窗口\n\n这是 agent 按要求写出的初稿：${question}\n`)
    done.push('写出了初稿')
  }
  return `完成：${done.join('；')}。`
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

    const { change: changing, annotations, track } = readPrompt(params.prompt)
    if (changing && !question.includes('#write') && !question.includes('#read')) {
      const answer = await change(client, params.sessionId, session, { question, context, annotations, track })
      await say(client, params.sessionId, answer)
      return { stopReason: 'end_turn' }
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
