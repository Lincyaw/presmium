import { parseArgs } from 'node:util'
import { startClassroomServer } from './index.ts'

const USAGE = `Usage: presmium-classroom-server [--port <n>] [--host <address>] [--deck <dir>]

Starts the room server that classroom sessions sync through. Decks point to it
in their frontmatter: presmium: { presmium.session: { server: ws://<host>:<port> } }

  --port <n>          port to listen on; 0 picks a free one (default: 1234)
  --host <address>    address to listen on (default: every interface)
  --deck <dir>        deck directory: archived classrooms are written to
                      <dir>/.presmium/classroom/<room>.json (default: the working directory)
  -h, --help          show this help`

/** Runs the server until it is stopped; returns the exit code on a usage error. */
export async function main(argv: string[]): Promise<number | undefined> {
  let port: number
  let host: string | undefined
  let deck: string | undefined
  try {
    const { values } = parseArgs({
      args: argv,
      options: { port: { type: 'string' }, host: { type: 'string' }, deck: { type: 'string' }, help: { type: 'boolean', short: 'h' } },
    })
    if (values.help) {
      process.stdout.write(`${USAGE}\n`)
      return 0
    }
    port = Number(values.port ?? 1234)
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid port "${values.port}"`)
    host = values.host
    deck = values.deck
  } catch (error) {
    process.stderr.write(`presmium-classroom-server: ${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n`)
    return 2
  }
  const server = await startClassroomServer({ port, host, deck })
  process.stdout.write(`classroom server  ${server.url}\narchives          ${server.archiveDir}\n`)
  const stop = () => void server.close().then(() => process.exit(0))
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  return undefined
}
