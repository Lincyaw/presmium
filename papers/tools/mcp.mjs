// Call Presmium's author actions (the MCP tools of the `presmium serve` running for this workspace) from the command
// line, through `presmium mcp`, the same relay an AI tool connects to. Images a tool returns (capture_slides,
// capture_reading, capture_overview) are saved as PNG files.
//
//   node tools/mcp.mjs <tool> '<json arguments>' [--out <dir>]
//   node tools/mcp.mjs list
//   node tools/mcp.mjs capture_slides '{"document":"hinted-scaling-laws","section":"p-problem"}' --out /tmp/shots
//
// `presmium serve . --allow spend,operate,write` must be running in papers/ (see CLAUDE.md); without it the relay only
// reads, checks and exports.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'

export const WORKSPACE = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** A connected client; close it with `client.close()`. */
export async function connect() {
  const client = new Client({ name: 'papers-pipeline', version: '1.0.0' })
  await client.connect(new StdioClientTransport({ command: join(WORKSPACE, 'node_modules/.bin/presmium'), args: ['mcp'], cwd: WORKSPACE, stderr: 'inherit' }))
  return client
}

/** Calls one tool; returns its structured result (or its text) and the images it returned. */
export async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const images = (result.content ?? []).filter(c => c.type === 'image')
  const text = (result.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n')
  if (result.isError) throw new Error(`${name}: ${text}`)
  let value = result.structuredContent
  if (value === undefined) { try { value = JSON.parse(text) } catch { value = text } }
  return { value, images, text }
}

export function saveImages(images, dir, prefix) {
  mkdirSync(dir, { recursive: true })
  return images.map((image, i) => {
    const file = join(dir, `${prefix}-${String(i).padStart(2, '0')}.png`)
    writeFileSync(file, Buffer.from(image.data, 'base64'))
    return file
  })
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [name, json = '{}', ...rest] = process.argv.slice(2)
  const out = rest[rest.indexOf('--out') + 1] && rest.includes('--out') ? rest[rest.indexOf('--out') + 1] : undefined
  const client = await connect()
  try {
    if (!name || name === 'list') {
      const { tools } = await client.listTools()
      for (const tool of tools) console.log(`${tool.name}\t${(tool.description ?? '').split('. ')[0]}`)
    } else {
      const { value, images } = await call(client, name, JSON.parse(json))
      const files = out ? saveImages(images, out, name) : []
      console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 1))
      for (const file of files) console.log(`saved ${file}`)
    }
  } finally {
    await client.close()
  }
}
