import type { RunResult } from '@lincyaw/kernel'

/** The text of a value of a MIME bundle: a list of lines (as nbformat splits long text) joined, other JSON printed. */
export function mimeText(value: unknown, space?: number): string {
  return Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value, null, space)
}

/** A readable projection of ordered notebook outputs, including the final expression. */
export function outputText(result: RunResult): string {
  if (!result.outputs || result.source === 'recorded') return result.stdout + (result.source === 'live' ? result.stderr : '')
  return result.outputs.map((output) => {
    if (output.output_type === 'stream') return output.text
    if (output.output_type === 'error') return `${output.traceback.join('\n') || `${output.ename}: ${output.evalue}`}\n`
    const data = output.data
    const text = mimeText(data['text/plain'] ?? data['text/markdown'] ?? data['application/json'], 2)
    return text && !text.endsWith('\n') ? `${text}\n` : text
  }).join('')
}
