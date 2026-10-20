import type { MdastNode } from '@lincyaw/kernel'

export interface QuizSource {
  prompt: MdastNode[]
  options: string[]
  answer: number[]
}

function plainText(node: MdastNode): string {
  return typeof node.value === 'string' ? node.value : (node.children ?? []).map(plainText).join('')
}

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
  prompt: MdastNode[]
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

export function optionList(value: unknown): string[] | undefined {
  const items = Array.isArray(value) ? value.map(String) : typeof value === 'string' ? value.split(/[,，]/) : []
  const options = items.map(item => item.trim()).filter(Boolean)
  return options.length >= 2 ? options : undefined
}
