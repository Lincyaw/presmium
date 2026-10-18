import type { ComponentNode, DirectiveContext, DirectiveSpec, IRBlock, MdastNode } from '@presmium/kernel'
import { CLASSROOM_ID, exerciseSource, optionList, quizSource } from '../domain/index.ts'

function component(name: string, props: Record<string, unknown>, prompt: MdastNode[], ctx: DirectiveContext): ComponentNode {
  const children: IRBlock[] = prompt.length ? [{ id: 'prompt', role: 'visual', at: 0, source: ctx.source, node: { type: 'markdown', mdast: { type: 'root', children: prompt } } }] : []
  return { type: 'component', plugin: CLASSROOM_ID, name, props, ...children.length ? { children } : {} }
}

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
    const question = input.arg?.trim()
    const levels = optionList(input.options.levels)
    return { node: component('PmPulse', { ...question ? { question } : {}, ...levels ? { levels } : {} }, body(input.body, ctx).children ?? [], ctx) }
  },
}

export const predictDirective: DirectiveSpec = {
  name: 'predict',
  arg: true,
  body: true,
  options: { choices: 'string' },
  toIR(input, ctx) {
    const question = input.arg?.trim() ?? ''
    const choices = optionList(input.options.choices)
    if (!question) ctx.report({ checkId: 'presmium.classroom', severity: 'error', message: '{predict} needs the question as its argument: ```{predict} How many …?' })
    if (input.options.choices !== undefined && !choices) ctx.report({ checkId: 'presmium.classroom', severity: 'warning', message: '{predict}: :choices: needs at least two, separated by commas; readers write their prediction instead' })
    return { node: component('PmPredict', { question, ...choices ? { choices } : {} }, body(input.body, ctx).children ?? [], ctx) }
  },
}
