/**
 * The classroom directives. Each makes a component whose prompt (Markdown)
 * is its child block, so both browser forms render it with the deck's
 * Markdown; the component itself only gets data props. The `fallback` is the
 * static form for renderers without the component.
 *
 * ````md
 * ```{quiz}
 * BPE 每一轮合并哪一对？
 *
 * - [ ] 最先出现的一对
 * - [x] 出现次数最多的一对
 * ```
 *
 * `````{exercise} python
 * 写函数 `mean(xs)`……
 *
 * ```python
 * def mean(xs): ...          # starter code
 * ```
 *
 * ```python
 * assert mean([1, 2]) == 1.5  # checks: one per top-level statement
 * ```
 * `````
 *
 * ```{question-box}
 * :target: bpe-merge        # optional: a block of this section the questions are about
 * 有疑问就在这里提出。
 * ```
 *
 * ```{pulse} 这一节讲清楚了吗？
 * :levels: 懂了, 有点模糊, 没懂
 * ```
 * ````
 */
import type { ComponentNode, DirectiveContext, DirectiveSpec, IRBlock, MdastNode } from '@presmium/kernel'
import { CLASSROOM_ID, optionLetter, parseExercise, parseQuiz, pulseLevels } from '../domain/index.ts'

const text = (value: string): MdastNode => ({ type: 'text', value })
const paragraph = (...children: MdastNode[]): MdastNode => ({ type: 'paragraph', children })
const strong = (value: string): MdastNode => ({ type: 'strong', children: [text(value)] })

/** A component of this plugin with `prompt` as its child block and `fallback` after the prompt. */
function component(name: string, props: Record<string, unknown>, prompt: string, ctx: DirectiveContext, fallback: MdastNode[]): ComponentNode {
  const mdast = prompt ? ctx.parse(prompt) : { type: 'root', children: [] }
  const shown = mdast.children ?? []
  const children: IRBlock[] = shown.length ? [{ id: 'prompt', role: 'visual', at: 0, source: ctx.source, node: { type: 'markdown', mdast } }] : []
  return {
    type: 'component',
    plugin: CLASSROOM_ID,
    name,
    props,
    ...children.length ? { children } : {},
    fallback: { type: 'root', children: [...shown, ...fallback] },
  }
}

export const quizDirective: DirectiveSpec = {
  name: 'quiz',
  body: true,
  toIR(input, ctx) {
    const { prompt, options, answer } = parseQuiz(input.body)
    if (options.length < 2) ctx.report({ checkId: 'presmium.classroom', severity: 'error', message: '{quiz} needs at least two options, written as a task list: `- [ ] wrong`, `- [x] right`' })
    else if (answer.length === 0) ctx.report({ checkId: 'presmium.classroom', severity: 'error', message: '{quiz}: mark the right options with `[x]`' })
    // In static form: the question with its options, the answer folded away.
    const fallback: MdastNode[] = [
      { type: 'list', ordered: true, spread: false, children: options.map(option => ({ type: 'listItem', children: [paragraph(text(option))] })) },
      { type: 'html', value: `<details><summary>答案</summary>${answer.map(optionLetter).join('、')}</details>` },
    ]
    return { node: component('PmQuiz', { options, answer }, prompt, ctx, fallback) }
  },
}

export const exerciseDirective: DirectiveSpec = {
  name: 'exercise',
  arg: true,
  body: true,
  options: { timeout: 'number' },
  toIR(input, ctx) {
    const lang = input.arg?.trim() || 'python'
    const { prompt, code } = parseExercise(input.body)
    const [starter, checks] = code
    if (!checks) ctx.report({ checkId: 'presmium.classroom', severity: 'error', message: '{exercise} needs two code blocks: the starter code, then the checks' })
    if (code.length > 2) ctx.report({ checkId: 'presmium.classroom', severity: 'warning', message: '{exercise}: code blocks after the second (the checks) are ignored' })
    if (lang !== 'python') ctx.report({ checkId: 'presmium.classroom', severity: 'warning', message: `{exercise}: checks run Python; ${lang} exercises cannot be checked` })
    const props: Record<string, unknown> = { lang, starter: starter?.value ?? '', checks: checks?.value ?? '' }
    const timeout = Number(input.options.timeout)
    if (Number.isFinite(timeout) && timeout > 0) props.timeout = timeout
    const fallback: MdastNode[] = [
      { type: 'code', lang, value: starter?.value ?? '' },
      paragraph(strong('校验')),
      { type: 'code', lang, value: checks?.value ?? '' },
    ]
    return { node: component('PmExercise', props, prompt, ctx, fallback) }
  },
}

export const questionBoxDirective: DirectiveSpec = {
  name: 'question-box',
  body: true,
  options: { target: 'string' },
  toIR(input, ctx) {
    const target = typeof input.options.target === 'string' ? input.options.target.trim() : ''
    const fallback = [paragraph(strong('提问'), text('：加入课堂后，在网页或幻灯片中向主讲提问。'))]
    return { node: component('PmQuestionBox', target ? { target } : {}, input.body.trim(), ctx, fallback) }
  },
}

export const pulseDirective: DirectiveSpec = {
  name: 'pulse',
  arg: true,
  body: true,
  options: { levels: 'string' },
  toIR(input, ctx) {
    const levels = pulseLevels(input.options.levels)
    const question = input.arg?.trim() || '这一节理解了吗？'
    const fallback = [paragraph(strong('理解度投票'), text(`：${question}（${levels.join(' / ')}）`))]
    return { node: component('PmPulse', { question, levels }, input.body.trim(), ctx, fallback) }
  },
}
