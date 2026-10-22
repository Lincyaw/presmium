import type { CodeNode, ComponentNode, DirectiveContext, DirectiveInput, IRBlock, RunSpec } from '@lincyaw/kernel'
import { parse } from 'yaml'
import { configuredTimeout, EXEC_ID, isPython, isScript, stringArgs } from '../domain/index.ts'

type Params = Record<string, unknown>

function params(value: unknown, lang: string, ctx: DirectiveContext): Params | undefined {
  if (value === undefined) return undefined
  let data = value
  try {
    if (typeof value === 'string') data = parse(value)
  }
  catch {}
  const variables = isPython(lang) || isScript(lang)
  if (data !== null && typeof data === 'object' && !Array.isArray(data)
    && (!variables || Object.values(data).every(v => ['string', 'number', 'boolean'].includes(typeof v)))) {
    return data as Params
  }
  ctx.report({ checkId: 'presmium.exec.syntax', severity: 'error', message: variables ? ':params: must be a mapping of names to values, e.g. {n: 5}' : ':params: must be a mapping, e.g. {n: 5}' })
  return undefined
}

function positive(value: unknown): number | undefined {
  const n = Number(value)
  return value !== undefined && Number.isFinite(n) && n > 0 ? n : undefined
}

/** The component of a directive whose body is code (the run panel, the step run), with the code as its child block. */
export function codeComponent(name: string, input: DirectiveInput, ctx: DirectiveContext, run?: Omit<RunSpec, 'lang'>): ComponentNode {
  const lang = input.arg?.trim() || 'python'
  const value = input.body.replace(/\n+$/, '')
  const props: Record<string, unknown> = { lang, code: value }
  const values = params(input.options.params, lang, ctx)
  if (values) props.params = values
  const timeout = positive(input.options.timeout) ?? configuredTimeout(ctx.config)
  if (timeout) props.timeout = timeout
  const code: CodeNode = { type: 'code', lang, value }
  if (run) code.run = { lang, ...run, ...values ? { args: stringArgs(values) } : {}, ...timeout ? { timeoutMs: timeout } : {} }
  const source: IRBlock = { id: 'source', role: 'visual', at: 0, source: ctx.source, node: code }
  return {
    type: 'component',
    plugin: EXEC_ID,
    name,
    props,
    children: [source],
    fallback: { type: 'root', children: [{ type: 'code', lang, value }] },
  }
}
