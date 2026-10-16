/**
 * The classroom directives. Each makes a component whose prompt (Markdown)
 * is its child block, so both browser forms render it with the deck's
 * Markdown; the component itself only gets data props. The `fallback`, the
 * static form for renderers without the component, is written by the
 * `classroom-places` pass in the deck's language (`./fallbacks.ts`).
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
import { CLASSROOM_ID, exerciseSource, pulseLevels, quizSource } from '../domain/index.ts'

/** A component of this plugin with the `prompt` nodes as its child block. */
function component(name: string, props: Record<string, unknown>, prompt: MdastNode[], ctx: DirectiveContext): ComponentNode {
  const children: IRBlock[] = prompt.length ? [{ id: 'prompt', role: 'visual', at: 0, source: ctx.source, node: { type: 'markdown', mdast: { type: 'root', children: prompt } } }] : []
  return { type: 'component', plugin: CLASSROOM_ID, name, props, ...children.length ? { children } : {} }
}

/** The body parsed once, as the deck's Markdown. */
const body = (text: string, ctx: DirectiveContext): MdastNode => (text.trim() ? ctx.parse(text) : { type: 'root', children: [] })

export const quizDirective: DirectiveSpec = {
  name: 'quiz',
  body: true,
  toIR(input, ctx) {
    const { prompt, options, answer } = quizSource(body(input.body, ctx))
    if (options.length < 2) ctx.report({ checkId: 'presmium.classroom', severity: 'error', message: '{quiz} needs at least two options, written as a task list: `- [ ] wrong`, `- [x] right`' })
    else if (answer.length === 0) ctx.report({ checkId: 'presmium.classroom', severity: 'error', message: '{quiz}: mark the right options with `[x]`' })
    return { node: component('PmQuiz', { options, answer }, prompt, ctx) }
  },
}

export const exerciseDirective: DirectiveSpec = {
  name: 'exercise',
  arg: true,
  body: true,
  options: { timeout: 'number' },
  toIR(input, ctx) {
    const lang = input.arg?.trim() || 'python'
    const { prompt, code } = exerciseSource(body(input.body, ctx))
    const [starter, checks] = code
    if (!checks) ctx.report({ checkId: 'presmium.classroom', severity: 'error', message: '{exercise} needs two code blocks: the starter code, then the checks' })
    if (code.length > 2) ctx.report({ checkId: 'presmium.classroom', severity: 'warning', message: '{exercise}: code blocks after the second (the checks) are ignored' })
    if (lang !== 'python') ctx.report({ checkId: 'presmium.classroom', severity: 'warning', message: `{exercise}: checks run Python; ${lang} exercises cannot be checked` })
    const props: Record<string, unknown> = { lang, starter: starter?.value ?? '', checks: checks?.value ?? '' }
    const timeout = Number(input.options.timeout)
    if (Number.isFinite(timeout) && timeout > 0) props.timeout = timeout
    return { node: component('PmExercise', props, prompt, ctx) }
  },
}

export const questionBoxDirective: DirectiveSpec = {
  name: 'question-box',
  body: true,
  options: { target: 'string' },
  toIR(input, ctx) {
    const target = typeof input.options.target === 'string' ? input.options.target.trim() : ''
    return { node: component('PmQuestionBox', target ? { target } : {}, body(input.body, ctx).children ?? [], ctx) }
  },
}

export const pulseDirective: DirectiveSpec = {
  name: 'pulse',
  arg: true,
  body: true,
  options: { levels: 'string' },
  toIR(input, ctx) {
    // Without them, the pass gives the question and the levels in the deck's language.
    const question = input.arg?.trim()
    const levels = pulseLevels(input.options.levels)
    return { node: component('PmPulse', { ...question ? { question } : {}, ...levels ? { levels } : {} }, body(input.body, ctx).children ?? [], ctx) }
  },
}
