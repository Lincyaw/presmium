import { isRecord, languageId } from '@presmium/kernel'
import type { RunOutput } from '@presmium/kernel'

/** ANSI escape sequences, which kernels put in tracebacks. */
const ANSI = /\u001B\[[0-9;?]*[ -/]*[@-~]/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

/**
 * The outputs of one execution, built from the kernel's IOPub messages
 * (`stream`, `display_data`, `execute_result`, `error`, and
 * `update_display_data`, `clear_output`) as nbformat outputs: consecutive
 * text of one stream is one output, a display updated by its id is replaced
 * where it is, `clear_output` (with `wait`, at the next output) empties them.
 */
export class OutputCollector {
  readonly outputs: RunOutput[] = []
  /** The display ids of the outputs, by index. */
  #ids: (string | undefined)[] = []
  #clearOnNext = false

  add(type: string, content: unknown): void {
    if (!isRecord(content)) return
    if (type === 'clear_output') {
      if (content.wait === true) this.#clearOnNext = true
      else this.#clear()
      return
    }
    if (type === 'update_display_data') {
      const id = displayId(content)
      const output = richOutput('display_data', content)
      this.#ids.forEach((known, i) => {
        if (id !== undefined && known === id && output) this.outputs[i] = output
      })
      return
    }
    const output = type === 'stream'
      ? streamOutput(content)
      : type === 'display_data' || type === 'execute_result'
        ? richOutput(type, content)
        : type === 'error'
          ? errorOutput(content)
          : undefined
    if (!output) return
    if (this.#clearOnNext) {
      this.#clear()
      this.#clearOnNext = false
    }
    const last = this.outputs.at(-1)
    if (output.output_type === 'stream' && last?.output_type === 'stream' && last.name === output.name) {
      this.outputs[this.outputs.length - 1] = { ...last, text: last.text + output.text }
      return
    }
    this.outputs.push(output)
    this.#ids.push(type === 'display_data' ? displayId(content) : undefined)
  }

  /** The text streams, for readers of `stdout` and `stderr`; an error's traceback, without colours, is stderr. */
  text(): { stdout: string, stderr: string } {
    let stdout = ''
    let stderr = ''
    for (const output of this.outputs) {
      if (output.output_type === 'stream') {
        if (output.name === 'stdout') stdout += output.text
        else stderr += output.text
      } else if (output.output_type === 'error') {
        stderr += `${stripAnsi(output.traceback.join('\n'))}\n`
      }
    }
    return { stdout, stderr }
  }

  #clear(): void {
    this.outputs.length = 0
    this.#ids = []
  }
}

function displayId(content: Record<string, unknown>): string | undefined {
  const transient = content.transient
  return isRecord(transient) && typeof transient.display_id === 'string' ? transient.display_id : undefined
}

function streamOutput(content: Record<string, unknown>): RunOutput | undefined {
  if (typeof content.text !== 'string') return undefined
  return { output_type: 'stream', name: content.name === 'stderr' ? 'stderr' : 'stdout', text: content.text }
}

function richOutput(type: 'display_data' | 'execute_result', content: Record<string, unknown>): RunOutput | undefined {
  if (!isRecord(content.data)) return undefined
  return { output_type: type, data: content.data, ...isRecord(content.metadata) && Object.keys(content.metadata).length ? { metadata: content.metadata } : {} }
}

function errorOutput(content: Record<string, unknown>): RunOutput {
  const traceback = Array.isArray(content.traceback) ? content.traceback.filter((line): line is string => typeof line === 'string') : []
  return { output_type: 'error', ename: String(content.ename ?? 'Error'), evalue: String(content.evalue ?? ''), traceback }
}

/**
 * How a Python kernel reads a parameter back, as Presmium's runner does
 * (`_pm_arg` of @presmium/kernel/runner.py): a Python literal, else JSON
 * (`true`, `false`, `null`), else the string itself.
 */
const PYTHON_ARG = `def _pm_arg(raw):
    import ast, json
    try:
        return ast.literal_eval(raw)
    except (ValueError, SyntaxError, TypeError, MemoryError, RecursionError):
        pass
    try:
        return json.loads(raw)
    except (ValueError, TypeError, RecursionError):
        return raw`

/**
 * The run's parameters (`RunRequest.args`, strings) as assignments run
 * before the code (docs/architecture.md 4.6), each value a JSON string
 * literal, which Python, Julia and R read alike. A Python kernel reads them
 * back as the runner does (`_pm_arg`, removed afterwards), so `n: 2` is the
 * number 2 and `verbose: false` is False there too; other kernels get the
 * strings. Names that are not identifiers are left out.
 */
export function argumentsCode(args: Record<string, string> | undefined, lang = ''): string | undefined {
  const python = languageId(lang) === 'python'
  const lines = Object.entries(args ?? {})
    .filter(([name]) => /^[A-Za-z_]\w*$/.test(name))
    .map(([name, value]) => `${name} = ${python ? `_pm_arg(${JSON.stringify(String(value))})` : JSON.stringify(String(value))}`)
  if (lines.length === 0) return undefined
  return python ? [PYTHON_ARG, ...lines, 'del _pm_arg'].join('\n') : lines.join('\n')
}
