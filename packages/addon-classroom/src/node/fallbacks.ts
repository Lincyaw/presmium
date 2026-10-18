import type { ComponentNode, IRBlock, MdastNode, RunResult } from '@presmium/kernel'
import { optionLetter } from '../domain/index.ts'
import type { ClassroomMessages } from '../domain/index.ts'

const text = (value: string): MdastNode => ({ type: 'text', value })
const paragraph = (...children: MdastNode[]): MdastNode => ({ type: 'paragraph', children })
const strong = (value: string): MdastNode => ({ type: 'strong', children: [text(value)] })
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
const html = (value: string): MdastNode => ({ type: 'html', value })
const numbered = (items: string[]): MdastNode => ({ type: 'list', ordered: true, spread: false, children: items.map(item => ({ type: 'listItem', children: [paragraph(text(item))] })) })
const lettered = (items: string[]): MdastNode[] => items.map((item, i) => paragraph(text(`${optionLetter(i)}. ${item}`)))

const joined = (value: unknown): string => (Array.isArray(value) ? value.join('') : typeof value === 'string' ? value : '')

function printed(run: RunResult): string {
  if (!run.outputs) return [run.stdout, run.stderr].join('')
  return run.outputs.map((output) => {
    if (output.output_type === 'stream') return joined(output.text)
    if (output.output_type === 'error') return `${output.ename}: ${output.evalue}\n`
    const text = joined(output.data['text/plain'])
    return text && !text.endsWith('\n') ? `${text}\n` : text
  }).join('')
}

function shown({ node }: IRBlock): MdastNode[] {
  if (node.type === 'markdown') return node.mdast.type === 'root' ? node.mdast.children ?? [] : [node.mdast]
  if (node.type === 'code') {
    const output = (node.outputs ?? []).map(printed).join('').trimEnd()
    return [
      ...node.echo === false ? [] : [{ type: 'code', lang: node.lang, value: node.value }],
      ...output ? [{ type: 'code', lang: 'text', value: output }] : [],
    ]
  }
  return node.fallback?.children ?? []
}

function folded(node: ComponentNode, t: ClassroomMessages): MdastNode[] {
  const ids = new Set([...strings(node.props.reveal), ...strings(node.props.notes)])
  const content = (node.children ?? []).filter(block => ids.has(block.id)).flatMap(shown)
  return content.length ? [html(`<details data-static="open"><summary>${t.fallback.reveal}</summary>`), ...content, html('</details>')] : []
}

function after(node: ComponentNode, t: ClassroomMessages): MdastNode[] {
  const { props } = node
  switch (node.name) {
    case 'PmQuiz':
      return [
        ...lettered(strings(props.options)),
        html(`<details><summary>${t.fallback.answer}</summary>${(props.answer as number[] ?? []).map(optionLetter).join(t.quiz.letters)}</details>`),
      ]
    case 'PmExercise':
      return [
        { type: 'code', lang: String(props.lang), value: String(props.starter ?? '') },
        paragraph(strong(t.fallback.checks)),
        { type: 'code', lang: String(props.lang), value: String(props.checks ?? '') },
      ]
    case 'PmQuestionBox':
      return [paragraph(strong(t.fallback.questions[0]), text(t.fallback.questions[1]))]
    case 'PmPulse':
      return [paragraph(strong(t.fallback.pulse[0]), text(t.fallback.pulse[1](String(props.question), strings(props.levels))))]
    case 'PmPredict':
      return [props.choices ? numbered(strings(props.choices)) : paragraph(text(t.fallback.write)), ...folded(node, t)]
    default:
      return []
  }
}

export function fallbackOf(node: ComponentNode, t: ClassroomMessages): MdastNode {
  const prompt = node.children?.find(block => block.id === 'prompt')?.node
  const question = node.name === 'PmPredict' ? [paragraph(strong(t.fallback.predict), text(`${t.colon}${String(node.props.question)}`))] : []
  return { type: 'root', children: [...question, ...prompt?.type === 'markdown' ? prompt.mdast.children ?? [] : [], ...after(node, t)] }
}
