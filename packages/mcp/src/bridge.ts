import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/server'
import type { JSONRPCMessage } from '@modelcontextprotocol/server'
import { errorMessage, isRecord } from '@lincyaw/kernel'

/** A running Presmium server's MCP endpoint and the access token it wrote to its state file. */
export interface BridgeTarget {
  mcp: string
  token: string
}

export interface BridgeOptions {
  /** The server as its state file names it now: read again whenever the one in use cannot be reached. */
  locate(): BridgeTarget | undefined
  /** The answer to a request that no running server can take. */
  unreachable: string
  log(message: string): void
  input?: NodeJS.ReadableStream
  output?: NodeJS.WritableStream
}

const isRequest = (message: JSONRPCMessage): message is JSONRPCMessage & { id: string | number, method: string } =>
  'method' in message && 'id' in message
const isResponse = (message: JSONRPCMessage): message is JSONRPCMessage & { id: string | number } =>
  !('method' in message) && 'id' in message

/**
 * Relays an MCP client on stdio (Claude Code, Codex) to the /mcp of a running Presmium server, message by message and
 * unchanged, so the client gets the server's whole tool set: authoring, history, voiceover and the author's windows.
 * The client's configuration names only a command; the server's port and access token, which change whenever it starts
 * again, are read from its state file, at first and again when it cannot be reached.
 */
export async function bridgeStdio(first: BridgeTarget, options: BridgeOptions): Promise<void> {
  const input = options.input ?? process.stdin
  const output = options.output ?? process.stdout
  const write = (message: JSONRPCMessage) => void output.write(serializeMessage(message))
  const initializing = new Set<string | number>()
  let protocolVersion: string | undefined
  let target = first
  let closed = false

  const open = async (to: BridgeTarget): Promise<StreamableHTTPClientTransport> => {
    const transport = new StreamableHTTPClientTransport(new URL(to.mcp), { requestInit: { headers: { Authorization: `Bearer ${to.token}` } } })
    transport.onmessage = (message: JSONRPCMessage) => {
      // The negotiated version goes on every later request as its MCP-Protocol-Version header.
      if (isResponse(message) && initializing.delete(message.id) && 'result' in message && isRecord(message.result) && typeof message.result.protocolVersion === 'string') {
        protocolVersion = message.result.protocolVersion
        transport.setProtocolVersion(protocolVersion)
      }
      write(message)
    }
    transport.onerror = error => options.log(errorMessage(error))
    await transport.start()
    if (protocolVersion) transport.setProtocolVersion(protocolVersion)
    return transport
  }
  let transport = await open(target)

  const deliver = async (message: JSONRPCMessage): Promise<void> => {
    if (isRequest(message) && message.method === 'initialize') initializing.add(message.id)
    try {
      await transport.send(message)
      return
    } catch (error) {
      // The server stopped, or started again elsewhere with another access token: follow its state file.
      const next = options.locate()
      if (next && (next.mcp !== target.mcp || next.token !== target.token)) {
        options.log(`${target.mcp} could not be reached (${errorMessage(error)}); now ${next.mcp}`)
        const before = transport
        target = next
        transport = await open(next)
        void before.close().catch(() => undefined)
        try {
          await transport.send(message)
          return
        } catch (retry) {
          options.log(errorMessage(retry))
        }
      } else {
        options.log(errorMessage(error))
      }
    }
    if (isRequest(message)) {
      initializing.delete(message.id)
      write({ jsonrpc: '2.0', id: message.id, error: { code: -32000, message: options.unreachable } } as JSONRPCMessage)
    }
  }

  const buffer = new ReadBuffer()
  input.on('data', (chunk: Buffer) => {
    buffer.append(chunk)
    for (let message = buffer.readMessage(); message !== null; message = buffer.readMessage()) void deliver(message)
  })
  await new Promise<void>((done) => {
    const end = () => {
      if (closed) return
      closed = true
      void transport.close().catch(() => undefined).finally(done)
    }
    input.once('end', end)
    input.once('close', end)
  })
}
