/**
 * The bodies of `{quiz}` and `{exercise}` as authors write them, parsed as
 * MyST: Markdown for the prompt, plus a task list (the options) or code
 * blocks (the starter code and the checks), at the top level of the body.
 * Code blocks inside other blocks, e.g. an example of a task list in a fence,
 * stay in the prompt.
 */
import type { MdastNode } from '@presmium/kernel'

export interface QuizSource {
  /** The nodes around the options. */
  prompt: MdastNode[]
  options: string[]
  /** Indexes of the options marked `[x]`. */
  answer: number[]
}

/** The text of a node, as a reader sees it (markup left out). */
function plainText(node: MdastNode): string {
  return typeof node.value === 'string' ? node.value : (node.children ?? []).map(plainText).join('')
}

/** `- [ ] option` or `- [x] option` at the top level; `x` marks a right option. */
export function quizSource(body: MdastNode): QuizSource {
  const prompt: MdastNode[] = []
  const options: string[] = []
  const answer: number[] = []
  for (const node of body.children ?? []) {
    const items = node.type === 'list' ? (node.children ?? []).filter(item => typeof item.checked === 'boolean') : []
    if (items.length === 0) {
      prompt.push(node)
      continue
    }
    for (const item of items) {
      if (item.checked) answer.push(options.length)
      options.push(plainText(item).trim())
    }
  }
  return { prompt, options, answer }
}

export interface CodeSource {
  lang: string
  value: string
}

export interface ExerciseSource {
  /** The nodes besides the top-level code blocks. */
  prompt: MdastNode[]
  /** Top-level code blocks in order: the starter code, then the checks. */
  code: CodeSource[]
}

export function exerciseSource(body: MdastNode): ExerciseSource {
  const prompt: MdastNode[] = []
  const code: CodeSource[] = []
  for (const node of body.children ?? []) {
    if (node.type === 'code') code.push({ lang: typeof node.lang === 'string' ? node.lang : '', value: String(node.value ?? '') })
    else prompt.push(node)
  }
  return { prompt, code }
}

/**
 * The options of a directive option such as `{pulse}`'s `:levels:` or
 * `{predict}`'s `:choices:`: `a, b, c` (a full-width comma too), or a list;
 * undefined when fewer than two are given.
 */
export function optionList(value: unknown): string[] | undefined {
  const items = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(/[,，]/) : []
  const options = items.map(item => item.trim()).filter(Boolean)
  return options.length >= 2 ? options : undefined
}
