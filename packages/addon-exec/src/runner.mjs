import { transform } from 'sucrase'

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

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

function failure(error) {
  const line = error instanceof Error ? /^.*data:text\/javascript.*?:(\d+):\d+\)?$/m.exec(error.stack ?? '')?.[1] : undefined
  return `${show(error)}${line ? ` (line ${line})` : ''}`
}

function literal(raw) {
  try {
    JSON.parse(raw)
    return raw
  } catch {
    return JSON.stringify(raw)
  }
}

const SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])([^'"\n]+)\2/g

export function prepare({ code, args = {}, typescript = false, imports = {} }) {
  const js = typescript ? transform(code, { transforms: ['typescript'], disableESTransforms: true }).code : code
  const constants = Object.entries(args).filter(([name]) => IDENTIFIER.test(name)).map(([name, raw]) => `const ${name} = ${literal(String(raw))};`)
  const mapped = js.replace(SPECIFIER, (match, keyword, quote, name) => Object.hasOwn(imports, name) ? `${keyword}${quote}${imports[name]}${quote}` : match)
  return constants.join(' ') + mapped
}

function trackTimers() {
  const native = { setTimeout, clearTimeout, setInterval, clearInterval }
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
    restore() {
      for (const id of pending) cancel(id)
      Object.assign(globalThis, native)
      if (node) node.off('unhandledRejection', onNode)
      else globalThis.removeEventListener?.('unhandledrejection', onWorker)
    },
  }
}

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
