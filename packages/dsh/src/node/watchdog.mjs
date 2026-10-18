#!/usr/bin/env node
// Runs a command in this process's group and ends the whole group, its descendants included, when the
// process that started it goes (docs/design-dsh.md 6.2 and 14): this process's stdin is a pipe from it,
// which closes when it exits, even after SIGKILL. A SIGTERM ends the group the same way. Plain ESM, run
// by node directly: `node watchdog.mjs <command> [args...]`, spawned `detached` so the group is its own.
import { spawn } from 'node:child_process'

/** How long the command has to end after SIGTERM, before the group is killed. */
const GRACE_MS = 5000

const [command, ...args] = process.argv.slice(2)
if (!command) {
  process.stderr.write('usage: watchdog.mjs <command> [args...]\n')
  process.exit(2)
}

const group = (signal) => {
  try {
    process.kill(-process.pid, signal)
  } catch {
    // The group is gone already.
  }
}

const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] })
let ending = false
const end = () => {
  if (ending) return
  ending = true
  // This process gets the SIGTERM too and handles it below: it waits for the command.
  group('SIGTERM')
  setTimeout(() => group('SIGKILL'), GRACE_MS).unref()
}

process.on('SIGTERM', end)
process.on('SIGINT', end)
process.stdin.on('end', end).on('close', end).on('error', end)
process.stdin.resume()
child.on('error', (error) => {
  process.stderr.write(`watchdog: ${error.message}\n`)
  process.exit(1)
})
// Whatever the command left running in the group goes with it.
child.on('exit', () => group('SIGKILL'))
