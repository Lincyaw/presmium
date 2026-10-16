/**
 * The static form of the classroom components (their IR `fallback`), for
 * renderers and exports without the live component: the prompt, then what a
 * reader of a static copy can use, in the deck's language. A notebook shows
 * them so (`./extensions.ts`).
 */
import type { ComponentNode, IRBlock, MdastNode } from '@presmium/kernel'
import { optionLetter } from '../domain/index.ts'
import type { ClassroomMessages } from '../domain/index.ts'

const text = (value: string): MdastNode => ({ type: 'text', value })
const paragraph = (...children: MdastNode[]): MdastNode => ({ type: 'paragraph', children })
const strong = (value: string): MdastNode => ({ type: 'strong', children: [text(value)] })
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])
const html = (value: string): MdastNode => ({ type: 'html', value })
const numbered = (items: string[]): MdastNode => ({ type: 'list', ordered: true, spread: false, children: items.map(item => ({ type: 'listItem', children: [paragraph(text(item))] })) })

/** What a block shows, as mdast: its Markdown, its code, or a component's static form. */
function shown({ node }: IRBlock): MdastNode[] {
  if (node.type === 'markdown') return node.mdast.type === 'root' ? node.mdast.children ?? [] : [node.mdast]
  if (node.type === 'code') return [{ type: 'code', lang: node.lang, value: node.value }]
  return node.fallback?.children ?? []
}

/** What a predict reveals (its children that `reveal` and `notes` name), folded away. */
function folded(node: ComponentNode, t: ClassroomMessages): MdastNode[] {
  const ids = new Set([...strings(node.props.reveal), ...strings(node.props.notes)])
  const content = (node.children ?? []).filter(block => ids.has(block.id)).flatMap(shown)
  return content.length ? [html(`<details><summary>${t.fallback.reveal}</summary>`), ...content, html('</details>')] : []
}

function after(node: ComponentNode, t: ClassroomMessages): MdastNode[] {
  const { props } = node
  switch (node.name) {
    case 'PmQuiz':
      // The question with its options, the answer folded away.
      return [
        numbered(strings(props.options)),
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
      // The choices, or a word to write the prediction down first, then what it reveals, folded away.
      return [props.choices ? numbered(strings(props.choices)) : paragraph(text(t.fallback.write)), ...folded(node, t)]
    default:
      return []
  }
}

/** The component's prompt (its child block), after a predict's question, followed by its static content. */
export function fallbackOf(node: ComponentNode, t: ClassroomMessages): MdastNode {
  const prompt = node.children?.find(block => block.id === 'prompt')?.node
  const question = node.name === 'PmPredict' ? [paragraph(strong(t.fallback.predict), text(`${t.colon}${String(node.props.question)}`))] : []
  return { type: 'root', children: [...question, ...prompt?.type === 'markdown' ? prompt.mdast.children ?? [] : [], ...after(node, t)] }
}
