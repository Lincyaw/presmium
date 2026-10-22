import type { RunResult } from './contracts.ts'
import type { MdastNode } from './ir.ts'

/** Whether a run only displays Markdown, which a renderer can show as prose; `rendered` names the MIME types the renderer draws itself. */
export function isProseRun(run: RunResult, rendered: (type: string) => boolean = () => false): boolean {
  const outputs = run.outputs ?? []
  return outputs.length > 0 && outputs.every(o => (o.output_type === 'display_data' || o.output_type === 'execute_result')
    && o.data['text/markdown'] !== undefined && !Object.keys(o.data).some(rendered))
}

/** A run's Markdown output with its raw HTML turned into text, so that the HTML shows as written. */
export function htmlAsText(node: MdastNode): MdastNode {
  if (node.type === 'html') return { type: 'text', value: String(node.value ?? '') }
  return node.children ? { ...node, children: node.children.map(htmlAsText) } : node
}
