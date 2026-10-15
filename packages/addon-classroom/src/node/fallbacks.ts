/**
 * The static form of the classroom components (their IR `fallback`), for
 * renderers and exports without the live component: the prompt, then what a
 * reader of a static copy can use, in the deck's language.
 */
import type { ComponentNode, MdastNode } from '@presmium/kernel'
import { optionLetter } from '../domain/index.ts'
import type { ClassroomMessages } from '../domain/index.ts'

const text = (value: string): MdastNode => ({ type: 'text', value })
const paragraph = (...children: MdastNode[]): MdastNode => ({ type: 'paragraph', children })
const strong = (value: string): MdastNode => ({ type: 'strong', children: [text(value)] })
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.map(String) : [])

function after(node: ComponentNode, t: ClassroomMessages): MdastNode[] {
  const { props } = node
  switch (node.name) {
    case 'PmQuiz':
      // The question with its options, the answer folded away.
      return [
        { type: 'list', ordered: true, spread: false, children: strings(props.options).map(option => ({ type: 'listItem', children: [paragraph(text(option))] })) },
        { type: 'html', value: `<details><summary>${t.fallback.answer}</summary>${(props.answer as number[] ?? []).map(optionLetter).join(t.quiz.letters)}</details>` },
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
    default:
      return []
  }
}

/** The component's prompt (its child block) followed by its static content. */
export function fallbackOf(node: ComponentNode, t: ClassroomMessages): MdastNode {
  const prompt = node.children?.find(block => block.id === 'prompt')?.node
  return { type: 'root', children: [...prompt?.type === 'markdown' ? prompt.mdast.children ?? [] : [], ...after(node, t)] }
}
