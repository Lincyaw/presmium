// Runs JavaScript and TypeScript for Presmium: in a Web Worker for client/script.worker.ts, and in
// a node process for node/script.ts, so both give the same output. Like runner.py for Python, it is
// plain code shared by both. TypeScript loses its types (Sucrase keeps the line numbers); the
// arguments are declared as constants before the code; the console output (and, in node, what the
// code writes to process.stdout and process.stderr) is captured until the code has nothing left to
// do, so output from its timers is part of the run in both places, and an error a timer or a
// promise raises after the code ran fails the run in both.
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

/** A module specifier in `import … from '…'`, `export … from '…'`, `import '…'` or `import('…')`. */
const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\2/g

/**
 * The module to run: the argument constants on the first line, so line numbers stay, then the code,
 * its imports of the names `imports` maps (an import map, which workers do not have) going to
 * their URLs.
 */
export function prepare({ code, args = {}, typescript = false, imports = {} }) {
  const js = typescript ? transform(code, { transforms: ['typescript'], disableESTransforms: true }).code : code
  const constants = Object.entries(args).filter(([name]) => IDENTIFIER.test(name)).map(([name, raw]) => `const ${name} = ${literal(String(raw))};`)
  const mapped = js.replace(SPECIFIER, (match, keyword, quote, name) => Object.hasOwn(imports, name) ? `${keyword}${quote}${imports[name]}${quote}` : match)
  return constants.join(' ') + mapped
}

/**
 * Lets the run wait for the timers the code sets (`setTimeout`, `setInterval`) while it is active.
 * `idle()` resolves once none is left, or rejects with the first error a callback threw (or the
 * promise an async callback returned rejected with) or a promise rejection nobody handled, as a
 * node process ends in either case. A rejection nobody handled is reported in a task of its own
 * after the one that left it (in a worker, on the worker; in node, before the next timer), so the
 * run settles only after a further task finds nothing pending. An interval that is never cleared
 * keeps the run going until the executor's timeout stops it, as in node.
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
  const decide = () => {
    if (failed) settle.reject(failed.reason)
    else if (pending.size === 0) settle.resolve()
  }
  // Checked in a later task, once the callbacks of this one and their promise jobs have run, and
  // once more in the task after, by when a rejection they left unhandled has been reported.
  const check = () => later(() => {
    if (!armed) return
    if (failed || pending.size > 0) return decide()
    later(decide)
  })
  const fail = (reason) => {
    failed ??= { reason }
    check()
  }
  const call = (callback, args) => {
    try {
      const result = typeof callback === 'function' ? callback(...args) : undefined
      // An async callback fails when the promise it returns rejects.
      if (typeof result?.then === 'function') result.then(undefined, fail)
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

/**
 * The output of a run: the text streams, and the same text as nbformat stream outputs in the
 * order it was written (`outputs`, docs/ir.md 6.1).
 */
function collector() {
  const text = { stdout: [], stderr: [] }
  const outputs = []
  return {
    text,
    outputs,
    stream: name => ({
      push(chunk) {
        text[name].push(chunk)
        const last = outputs.at(-1)
        if (last?.name === name) last.text += chunk
        else outputs.push({ output_type: 'stream', name, text: chunk })
      },
    }),
  }
}

/** In node, what the code writes to process.stdout and process.stderr goes to the run's output. */
function captureStreams(out, err) {
  const streams = [[globalThis.process?.stdout, out], [globalThis.process?.stderr, err]].filter(([stream]) => typeof stream?.write === 'function')
  const saved = streams.map(([stream]) => [stream, stream.write])
  for (const [stream, target] of streams) {
    stream.write = (chunk, encoding, callback) => {
      target.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk))
      const done = typeof encoding === 'function' ? encoding : callback
      if (typeof done === 'function') queueMicrotask(done)
      return true
    }
  }
  return () => saved.forEach(([stream, write]) => stream.write = write)
}

/** Runs the code as a module and returns `{ stdout, stderr, exitCode, outputs }` once it has nothing left to do. */
export async function runScript(request) {
  const output = collector()
  const out = output.stream('stdout')
  const err = output.stream('stderr')
  const write = target => (...values) => void target.push(`${values.map(show).join(' ')}\n`)
  const saved = { log: console.log, info: console.info, debug: console.debug, dir: console.dir, warn: console.warn, error: console.error }
  Object.assign(console, { log: write(out), info: write(out), debug: write(out), dir: value => write(out)(value), warn: write(err), error: write(err) })
  const restoreStreams = captureStreams(out, err)
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
    restoreStreams()
    Object.assign(console, saved)
  }
  return { stdout: output.text.stdout.join(''), stderr: output.text.stderr.join(''), exitCode, outputs: output.outputs }
}
