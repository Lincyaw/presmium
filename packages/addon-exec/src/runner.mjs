// Runs JavaScript and TypeScript for Presmium: in a Web Worker for client/script.worker.ts, and in
// a node process for node/script.ts, so both give the same output. Like runner.py for Python, it is
// plain code shared by both. TypeScript loses its types (Sucrase keeps the line numbers); the
// arguments are declared as constants before the code; the console output is captured until the
// code has nothing left to do, so output from its timers is part of the run in both places.
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

/**
 * Lets the run wait for the timers the code sets (`setTimeout`, `setInterval`) while it is active.
 * `idle()` resolves once none is left, or rejects with the first error a callback threw or a
 * promise rejection nobody handled, as a node process ends in either case. An interval that is
 * never cleared keeps the run going until the executor's timeout stops it, as in node.
 */
function trackTimers() {
  const native = { setTimeout, clearTimeout, setInterval, clearInterval }
  // Called as plain functions: browsers reject a timer function called on another object.
  const { setTimeout: later, clearTimeout: cancel, setInterval: every } = native
  const pending = new Set()
  let armed = false
  let failed
  let settle
  const done = new Promise((resolve, reject) => settle = { resolve, reject })
  // Checked in a later task, once the callbacks of this one and their promise jobs have run.
  const check = () => later(() => {
    if (!armed) return
    if (failed) settle.reject(failed.reason)
    else if (pending.size === 0) settle.resolve()
  })
  const fail = (reason) => {
    failed ??= { reason }
    check()
  }
  const call = (callback, args) => {
    try {
      if (typeof callback === 'function') callback(...args)
    } catch (error) {
      fail(error)
    }
  }
  const clear = (id) => {
    pending.delete(id)
    cancel(id)
    check()
  }
  Object.assign(globalThis, {
    setTimeout(callback, delay, ...args) {
      const id = later(() => {
        pending.delete(id)
        call(callback, args)
        check()
      }, delay)
      pending.add(id)
      return id
    },
    setInterval(callback, delay, ...args) {
      const id = every(() => call(callback, args), delay)
      pending.add(id)
      return id
    },
    clearTimeout: clear,
    clearInterval: clear,
  })
  // Unhandled rejections: node emits them on `process`, a worker on itself.
  const node = typeof globalThis.process?.on === 'function' ? globalThis.process : undefined
  const onNode = reason => fail(reason)
  const onWorker = (event) => {
    event.preventDefault()
    fail(event.reason)
  }
  if (node) node.on('unhandledRejection', onNode)
  else globalThis.addEventListener?.('unhandledrejection', onWorker)
  return {
    idle() {
      armed = true
      check()
      return done
    },
    /** Puts the native timers back and cancels what the code left pending. */
    restore() {
      for (const id of pending) cancel(id)
      Object.assign(globalThis, native)
      if (node) node.off('unhandledRejection', onNode)
      else globalThis.removeEventListener?.('unhandledrejection', onWorker)
    },
  }
}

/** Runs the code as a module and returns `{ stdout, stderr, exitCode }` once it has nothing left to do. */
export async function runScript(request) {
  const out = []
  const err = []
  const write = target => (...values) => void target.push(`${values.map(show).join(' ')}\n`)
  const saved = { log: console.log, info: console.info, debug: console.debug, warn: console.warn, error: console.error }
  Object.assign(console, { log: write(out), info: write(out), debug: write(out), warn: write(err), error: write(err) })
  const timers = trackTimers()
  let exitCode = 0
  try {
    await import(/* @vite-ignore */ `data:text/javascript;charset=utf-8,${encodeURIComponent(prepare(request))}`)
    await timers.idle()
  } catch (error) {
    err.push(`${failure(error)}\n`)
    exitCode = 1
  } finally {
    timers.restore()
    Object.assign(console, saved)
  }
  return { stdout: out.join(''), stderr: err.join(''), exitCode }
}
