import type { CodeNode, DirectiveSpec, RunSpec } from '@presmium/kernel'
import { parseCodeRef, splitTarget } from '../domain/index.ts'
import type { CodeRefSpec } from '../domain/index.ts'

/**
 * What each `{code-ref}` code node asks for, for the resolution pass of the
 * same compilation (./resolve.ts). The IR keeps only what was resolved.
 */
export const codeRefs = new WeakMap<CodeNode, CodeRefSpec>()

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function langOf(file: string | undefined): string {
  return /\.([\w-]+)$/.exec(file ?? '')?.[1] ?? 'text'
}

/** `:run:` [compile|live|both] with `:executor:` and `:timeout:` (ms), as on MyST code blocks. */
function runSpec(lang: string, options: Record<string, unknown>): RunSpec | undefined {
  if (options.run === undefined) return undefined
  const when = String(options.run).trim()
  const spec: RunSpec = { lang, when: when === 'live' || when === 'both' ? when : 'compile' }
  if (typeof options.executor === 'string' && options.executor.trim()) spec.executor = options.executor.trim()
  const timeout = Number(options.timeout)
  if (Number.isFinite(timeout) && timeout > 0) spec.timeoutMs = timeout
  return spec
}

/**
 * ```` ```{code-ref} region:src/cart.ts#checkout ```` with `:pin:`, `:steps:`,
 * `:variants:`, `:lang:`, `:repo:` and `:run:`. Becomes a code node whose code,
 * origin, highlights and versions the resolution pass fills in; it takes one
 * step per highlighted unit or version after the first.
 */
export const codeRefDirective: DirectiveSpec = {
  name: 'code-ref',
  arg: true,
  options: { pin: 'string', steps: 'list', variants: 'list', lang: 'string', repo: 'string', run: 'string', executor: 'string', timeout: 'number' },
  toIR(input, ctx) {
    let spec: CodeRefSpec
    try {
      spec = parseCodeRef(input.arg, input.options)
    }
    catch (error) {
      const message = `invalid {code-ref}: ${errorMessage(error)}`
      ctx.report({ checkId: 'presmium.code.syntax', severity: 'error', message })
      return { node: { type: 'markdown', mdast: ctx.parse(`> ${message}`) } }
    }
    const file = splitTarget(spec.anchor)?.file ?? ''
    const lang = spec.lang ?? langOf(file)
    // Placeholders until the pass resolves the anchor; an anchor that cannot be read stays `lost`.
    const node: CodeNode = { type: 'code', lang, value: '', origin: { anchor: spec.anchor, file, startLine: 0, endLine: 0, status: 'lost' } }
    const run = runSpec(lang, input.options)
    if (run) node.run = run
    codeRefs.set(node, spec)
    return { node, span: Math.max(0, (spec.steps ?? spec.variants ?? []).length - 1) }
  },
}
