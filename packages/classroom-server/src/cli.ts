import { networkInterfaces } from 'node:os'
import { parseArgs } from 'node:util'
import { errorMessage } from '@presmium/kernel'
import { startClassroomServer } from './index.ts'

const USAGE = `Usage: presmium-classroom-server [--port <n>] [--host <address>] [--deck <dir>]

Starts the room server that classroom sessions sync through. Decks point to it
in their frontmatter: presmium: { presmium.session: { server: ws://<host>:<port> } }
Listening on every interface, it also prints its addresses on the local network:
learners' devices reach it there, not at localhost.

  --port <n>          port to listen on; 0 picks a free one (default: 1234)
  --host <address>    address to listen on (default: every interface)
  --deck <dir>        deck directory: archived classrooms are written to
                      <dir>/.presmium/classroom/<room>.json (default: the working directory)
  -h, --help          show this help

Run it on the classroom's own network: anyone with a join link can join. Only
the window that created a classroom can end or archive it, open and close its
quizzes or move its learners; the others write only their own answers,
questions, votes and submissions.`

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
    process.stderr.write(`presmium-classroom-server: ${errorMessage(error)}\n\n${USAGE}\n`)
    return 2
  }
  const server = await startClassroomServer({ port, host, deck })
  const network = !host || host === '0.0.0.0' || host === '::' ? lanAddresses().map(address => `network           ws://${address}:${server.port}\n`) : []
  process.stdout.write(`classroom server  ${server.url}\n${network.join('')}archives          ${server.archiveDir}\n`)
  const stop = () => void server.close().then(() => process.exit(0))
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  return undefined
}

/** The machine's IPv4 addresses on its networks (not the loopback), where other devices reach it. */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces()).flatMap(entries => entries ?? []).filter(entry => entry.family === 'IPv4' && !entry.internal).map(entry => entry.address)
}
