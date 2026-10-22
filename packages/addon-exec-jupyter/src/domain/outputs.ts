import { isRecord } from '@lincyaw/kernel'
import type { RunOutput } from '@lincyaw/kernel'

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
