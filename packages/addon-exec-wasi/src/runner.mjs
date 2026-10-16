// Runs C, C++, Ruby and SQL programs on Runno's WASI binaries (@runno/sandbox's dist/langs) with
// the WASI system of @runno/wasi: in a Web Worker for client/wasi.worker.ts, and in a Node worker
// thread for node/worker.mjs, so a live run and a compile-time recording have the same binaries,
// command lines, file system and streams. Like addon-exec's runner.mjs, it is plain code both use.
//
// C and C++ compile with clang and link with wasm-ld (both WebAssembly, with the sysroot of
// clang-fs.tar.gz) into a WASI program that then runs; Ruby and SQLite interpret the program.
// The caller loads the files (`load`): from the published runtime directory in the browser, from
// the installed package in Node. Compiled modules and unpacked archives are kept for later runs.
import { WASI } from '@runno/wasi'

const SYSROOT = 'clang-fs.tar.gz'

/** The files of each runtime, as @runno/sandbox ships them. */
export const RUNTIMES = {
  clang: ['clang.wasm', 'wasm-ld.wasm', SYSROOT],
  ruby: ['ruby-3.2.0.wasm', 'ruby-3.2.0.tar.gz'],
  sqlite: ['sqlite.wasm'],
}

/** Code block languages, with their usual aliases, and the runtime of each. */
const LANGUAGES = { 'c': 'c', 'cpp': 'cpp', 'c++': 'cpp', 'cc': 'cpp', 'cxx': 'cpp', 'ruby': 'ruby', 'rb': 'ruby', 'sql': 'sql', 'sqlite': 'sql' }
const RUNTIME_OF = { c: 'clang', cpp: 'clang', ruby: 'ruby', sql: 'sqlite' }

/** The language a code block's `lang` names (`c`, `cpp`, `ruby`, `sql`), or undefined when no WASI runtime runs it. */
export function wasiLanguage(lang) {
  const id = String(lang).trim().toLowerCase()
  return Object.hasOwn(LANGUAGES, id) ? LANGUAGES[id] : undefined
}

/** The runtime that runs a language, or undefined. */
export function runtimeOf(lang) {
  const id = wasiLanguage(lang)
  return id && RUNTIME_OF[id]
}

/** Whether an executor limited to `languages` (an environment's `languages`; all when omitted) runs `lang`. */
export function runsLanguage(lang, languages) {
  const id = wasiLanguage(lang)
  return id !== undefined && (!languages || languages.some(other => wasiLanguage(other) === id))
}

// Files get one fixed time, so a program that reads them gives the same output everywhere.
const EPOCH = new Date(0)
const TIMES = { access: EPOCH, modification: EPOCH, change: EPOCH }
const file = (path, content) => ({ path, timestamps: TIMES, ...typeof content === 'string' ? { mode: 'string', content } : { mode: 'binary', content } })

/** Compiled modules and unpacked archives by file name; one that failed to load is tried again next time. */
const ready = new Map()

function kept(name, make) {
  if (!ready.has(name)) {
    const value = make()
    ready.set(name, value)
    value.catch(() => ready.delete(name))
  }
  return ready.get(name)
}

const compiled = (name, load) => kept(name, () => load(name).then(bytes => WebAssembly.compile(bytes)))
const unpacked = (name, load) => kept(name, () => load(name).then(untar))

/** Loads, compiles and unpacks the runtime of `lang`, so that a run of it only runs; throws when a file cannot load. */
export async function prepare(lang, load) {
  const runtime = runtimeOf(lang)
  if (!runtime) throw new Error(`no WASI runtime runs ${lang}`)
  await Promise.all(RUNTIMES[runtime].map(name => name.endsWith('.wasm') ? compiled(name, load) : unpacked(name, load)))
}

/** Bytes behind gzip (a server may have decoded them already, for a `.gz` it sends with `Content-Encoding`). */
async function gunzip(bytes) {
  if (bytes[0] !== 0x1F || bytes[1] !== 0x8B) return bytes
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** The regular files of a ustar archive (the runtimes' format) as a WASI file system. */
async function untar(gz) {
  const tar = await gunzip(gz)
  const text = new TextDecoder()
  const field = (header, at, length) => text.decode(header.subarray(at, at + length)).replace(/\0.*$/s, '')
  const fs = {}
  for (let at = 0; at + 512 <= tar.length;) {
    const header = tar.subarray(at, at + 512)
    const name = field(header, 0, 100)
    if (!name) break
    const prefix = field(header, 345, 155)
    const size = Number.parseInt(field(header, 124, 12).trim() || '0', 8)
    const type = header[156]
    // '0' or NUL: a regular file.
    if (type === 0x30 || type === 0) {
      const path = `/${(prefix ? `${prefix}/${name}` : name).replace(/^\.?\//, '')}`
      fs[path] = file(path, tar.slice(at + 512, at + 512 + size))
    }
    at += 512 + Math.ceil(size / 512) * 512
  }
  return fs
}

/** Standard input as @runno/wasi reads it: chunks of at most `max` bytes, then null. */
function reader(input) {
  let rest = input
  return (max) => {
    if (!rest) return null
    // A UTF-16 unit is at most three bytes; a surrogate pair is not split.
    let n = Math.min(rest.length, Math.max(2, Math.floor(max / 3)))
    const code = rest.charCodeAt(n - 1)
    if (n < rest.length && code >= 0xD800 && code <= 0xDBFF) n--
    const chunk = rest.slice(0, n)
    rest = rest.slice(n)
    return chunk
  }
}

/** Starts a WASI program; a trap (e.g. a stack overflow) ends it with exit code 1 and the trap on stderr. */
async function start(module, { args, env = {}, fs = {}, stdin = '', write }) {
  const wasi = new WASI({
    args,
    env: { ...env },
    fs,
    stdin: reader(stdin),
    stdout: text => write('stdout', text),
    stderr: text => write('stderr', text),
  })
  const instance = await WebAssembly.instantiate(module, wasi.getImportObject())
  try {
    return wasi.start({ module, instance })
  } catch (error) {
    if (!(error instanceof WebAssembly.RuntimeError || error instanceof RangeError)) throw error
    write('stderr', `${error.name}: ${error.message}\n`)
    return { exitCode: 1, fs }
  }
}

const CLANG_C = ['-cc1', '-Werror', '-triple', 'wasm32-unknown-wasi', '-isysroot', '/sys', '-internal-isystem', '/sys/include', '-internal-isystem', '/sys/lib/clang/8.0.1/include', '-ferror-limit', '4', '-fmessage-length', '80', '-O2', '-emit-obj']
const CLANG_CPP = ['-cc1', '-Werror', '-emit-obj', '-disable-free', '-isysroot', '/sys', '-internal-isystem', '/sys/include/c++/v1', '-internal-isystem', '/sys/include', '-internal-isystem', '/sys/lib/clang/8.0.1/include', '-ferror-limit', '4', '-fmessage-length', '80', '-O2', '-x', 'c++']
const LINK = ['--no-threads', '--export-dynamic', '-z', 'stack-size=1048576', '-L/sys/lib/wasm32-wasi', '/sys/lib/wasm32-wasi/crt1.o', '/program.o', '-lc']

/**
 * Runs a request `{ lang, code, stdin?, files?, env? }`: `files` are put at
 * the root of the program's file system, `env` is its whole environment.
 * Resolves with the text streams, the exit code (the compiler's, when the code
 * does not compile) and the streams as nbformat stream outputs, in the order
 * written. Throws when the runtime cannot load.
 */
export async function runWasi(request, load) {
  const lang = wasiLanguage(request.lang)
  if (!lang) throw new Error(`no WASI runtime runs ${request.lang}`)
  const streams = { stdout: '', stderr: '' }
  const outputs = []
  const write = (name, text) => {
    if (!text) return
    streams[name] += text
    const last = outputs.at(-1)
    if (last?.name === name) last.text += text
    else outputs.push({ output_type: 'stream', name, text })
  }
  const files = {}
  for (const [name, content] of Object.entries(request.files ?? {})) {
    const path = `/${name.replace(/^\/+/, '')}`
    files[path] = file(path, content)
  }
  const program = { fs: files, env: request.env, stdin: request.stdin ?? '', write }
  const done = ({ exitCode }) => ({ ...streams, exitCode, outputs })

  if (lang === 'ruby') {
    const base = await unpacked('ruby-3.2.0.tar.gz', load)
    return done(await start(await compiled('ruby-3.2.0.wasm', load), { ...program, args: ['ruby', '-r', '/ruby-3.2.0/.rubyopts.rb', '/program.rb'], fs: { ...base, ...files, '/program.rb': file('/program.rb', request.code) } }))
  }
  if (lang === 'sql') {
    return done(await start(await compiled('sqlite.wasm', load), { ...program, args: ['sqlite', ':memory:', '.read /program.sql'], fs: { ...files, '/program.sql': file('/program.sql', request.code) } }))
  }

  // C and C++: compile, link, run. The tools get no environment and no input.
  const source = lang === 'cpp' ? '/program.cpp' : '/program.c'
  const sysroot = await unpacked(SYSROOT, load)
  const tool = { write, env: {}, stdin: '' }
  const compile = await start(await compiled('clang.wasm', load), { ...tool, args: ['clang', ...lang === 'cpp' ? CLANG_CPP : CLANG_C, '-o', '/program.o', source], fs: { ...sysroot, [source]: file(source, request.code) } })
  if (compile.exitCode !== 0) return done(compile)
  const link = await start(await compiled('wasm-ld.wasm', load), { ...tool, args: ['wasm-ld', ...LINK, ...lang === 'cpp' ? ['-lc++', '-lc++abi'] : [], '-o', '/program.wasm'], fs: { ...sysroot, '/program.o': compile.fs['/program.o'] } })
  if (link.exitCode !== 0) return done(link)
  const binary = link.fs['/program.wasm']
  return done(await start(await WebAssembly.compile(binary.content), { ...program, args: ['program'] }))
}
