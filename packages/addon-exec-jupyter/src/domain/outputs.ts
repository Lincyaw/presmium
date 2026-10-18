import { isRecord, languageId } from '@presmium/kernel'
import type { RunOutput } from '@presmium/kernel'

const ANSI = /\u001B\[[0-9;?]*[ -/]*[@-~]/g

export function stripAnsi(text: string): string {
  return text.replace(ANSI, '')
}

export class OutputCollector {
  readonly outputs: RunOutput[] = []
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

export function argumentsCode(args: Record<string, string> | undefined, lang = ''): string | undefined {
  const python = languageId(lang) === 'python'
  const lines = Object.entries(args ?? {})
    .filter(([name]) => /^[A-Za-z_]\w*$/.test(name))
    .map(([name, value]) => `${name} = ${python ? `_pm_arg(${JSON.stringify(String(value))})` : JSON.stringify(String(value))}`)
  if (lines.length === 0) return undefined
  return python ? [PYTHON_ARG, ...lines, 'del _pm_arg'].join('\n') : lines.join('\n')
}
