#!/usr/bin/env node
import { spawn } from 'node:child_process'

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
  }
}

const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] })
let ending = false
const end = () => {
  if (ending) return
  ending = true
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
child.on('exit', () => group('SIGKILL'))
