// Runs JavaScript and TypeScript for Presmium: in a Web Worker for client/script.worker.ts, and in
// a node process for node/script.ts, so both give the same output. Like runner.py for Python, it is
// plain code shared by both. TypeScript loses its types (Sucrase keeps the line numbers); the
// arguments are declared as constants before the code; the console output is captured.
import { transform } from 'sucrase'

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** A value as the console prints it. */
function show(value) {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  if (typeof value === 'function') return `[Function ${value.name || '(anonymous)'}]`
  if (typeof value === 'bigint') return `${value}n`
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** An error with the line of the code it was thrown at, when the stack names it. */
function failure(error) {
  const line = error instanceof Error ? /^.*data:text\/javascript.*?:(\d+):\d+\)?$/m.exec(error.stack ?? '')?.[1] : undefined
  return `${show(error)}${line ? ` (line ${line})` : ''}`
}

/** An argument that reads as JSON (10, 0.5, [1, 2], true) keeps its type; others are strings. */
function literal(raw) {
  try {
    JSON.parse(raw)
    return raw
  } catch {
    return JSON.stringify(raw)
  }
}

/** The module to run: the argument constants on the first line, so line numbers stay, then the code. */
export function prepare({ code, args = {}, typescript = false }) {
  const js = typescript ? transform(code, { transforms: ['typescript'], disableESTransforms: true }).code : code
  const constants = Object.entries(args).filter(([name]) => IDENTIFIER.test(name)).map(([name, raw]) => `const ${name} = ${literal(String(raw))};`)
  return constants.join(' ') + js
}

/** Runs the code as a module and returns `{ stdout, stderr, exitCode }`; what it schedules right away runs too. */
export async function runScript(request) {
  const out = []
  const err = []
  const write = target => (...values) => void target.push(`${values.map(show).join(' ')}\n`)
  const saved = { log: console.log, info: console.info, debug: console.debug, warn: console.warn, error: console.error }
  Object.assign(console, { log: write(out), info: write(out), debug: write(out), warn: write(err), error: write(err) })
  let exitCode = 0
  try {
    await import(/* @vite-ignore */ `data:text/javascript;charset=utf-8,${encodeURIComponent(prepare(request))}`)
    await new Promise(resolve => setTimeout(resolve))
  } catch (error) {
    err.push(`${failure(error)}\n`)
    exitCode = 1
  } finally {
    Object.assign(console, saved)
  }
  return { stdout: out.join(''), stderr: err.join(''), exitCode }
}
