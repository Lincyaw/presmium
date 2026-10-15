/**
 * `{run-panel}` (P-20, P-24) and `{step-run}` (P-21): a code body that becomes
 * a component wrapping a code block. The block is the component's only child,
 * so renderers that cannot run code still show it, with the output recorded
 * at compile time for a run panel.
 *
 * ```` ```{run-panel} python ```` options: `:params:` (a YAML mapping, the
 * variables injected into the program), `:timeout:` (ms), `:recorded:` (output
 * shown when a run fails or times out) and `:run:` (`both`, the default, also
 * records the output at compile time; `live` only runs in the browser).
 *
 * ```` ```{step-run} python ```` options: `:steps:` (the number of executed
 * lines, one step each), `:params:` and `:timeout:`.
 */
import type { CodeNode, ComponentNode, DirectiveContext, DirectiveInput, DirectiveSpec, IRBlock, RunSpec } from '@presmium/kernel'
import { parse } from 'yaml'
import { EXEC_ID, stringArgs } from '../domain/index.ts'

type Params = Record<string, string | number | boolean>

/** The `:params:` mapping: YAML in the option, or already a mapping from a `---` option block. */
function params(value: unknown, ctx: DirectiveContext): Params | undefined {
  if (value === undefined) return undefined
  let data = value
  try {
    if (typeof value === 'string') data = parse(value)
  }
  catch {}
  if (data !== null && typeof data === 'object' && !Array.isArray(data)
    && Object.values(data).every(v => ['string', 'number', 'boolean'].includes(typeof v))) {
    return data as Params
  }
  ctx.report({ checkId: 'presmium.exec.syntax', severity: 'error', message: ':params: must be a mapping of names to values, e.g. {n: 5}' })
  return undefined
}

function positive(value: unknown): number | undefined {
  const n = Number(value)
  return value !== undefined && Number.isFinite(n) && n > 0 ? n : undefined
}

/** The component node around the code block of the directive body. */
function component(name: string, input: DirectiveInput, ctx: DirectiveContext, run?: Omit<RunSpec, 'lang'>): ComponentNode {
  const lang = input.arg?.trim() || 'python'
  const props: Record<string, unknown> = { lang }
  const values = params(input.options.params, ctx)
  if (values) props.params = values
  const timeout = positive(input.options.timeout)
  if (timeout) props.timeout = timeout
  const code: CodeNode = { type: 'code', lang, value: input.body.replace(/\n+$/, '') }
  if (run) code.run = { lang, ...run, ...values ? { args: stringArgs(values) } : {}, ...timeout ? { timeoutMs: timeout } : {} }
  const source: IRBlock = { id: 'source', role: 'visual', at: 0, source: ctx.source, node: code }
  return {
    type: 'component',
    plugin: EXEC_ID,
    name,
    props,
    children: [source],
    fallback: { type: 'root', children: [{ type: 'code', lang, value: code.value }] },
  }
}

export const runPanelDirective: DirectiveSpec = {
  name: 'run-panel',
  arg: true,
  body: true,
  options: { params: 'string', timeout: 'number', recorded: 'string', run: 'string' },
  toIR(input, ctx) {
    const when = input.options.run === undefined ? 'both' : String(input.options.run).trim()
    if (when !== 'both' && when !== 'live') ctx.report({ checkId: 'presmium.exec.syntax', severity: 'warning', message: `{run-panel} :run: ${when} is not both or live; using both` })
    const node = component('PmRunPanel', input, ctx, { when: when === 'live' ? 'live' : 'both' })
    if (typeof input.options.recorded === 'string') node.props.recorded = input.options.recorded
    return { node }
  },
}

export const stepRunDirective: DirectiveSpec = {
  name: 'step-run',
  arg: true,
  body: true,
  options: { steps: 'number', params: 'string', timeout: 'number' },
  toIR(input, ctx) {
    const node = component('PmStepRun', input, ctx)
    const steps = Number(input.options.steps)
    if (!Number.isInteger(steps) || steps < 1) {
      ctx.report({ checkId: 'presmium.exec.syntax', severity: 'warning', message: '{step-run} needs :steps:, the number of lines the code executes; without it the slide has no steps' })
      return { node }
    }
    node.props.steps = steps
    // One step per executed line after the initial state: state k shows line k.
    return { node, span: steps }
  },
}
