import type { AnchorResolver, ResolvedLocation } from '@presmium/kernel'
import { Lang, parse } from '@ast-grep/napi'
import type { SgNode } from '@ast-grep/napi'
import { found, locate, notFound, splitTarget } from '../domain/index.ts'

const LANGS: Record<string, Lang> = {
  ts: Lang.TypeScript,
  mts: Lang.TypeScript,
  cts: Lang.TypeScript,
  tsx: Lang.Tsx,
  js: Lang.JavaScript,
  mjs: Lang.JavaScript,
  cjs: Lang.JavaScript,
  jsx: Lang.JavaScript,
}

/** Named declarations a symbol path can address. */
const DECLARATIONS = new Set([
  'function_declaration',
  'generator_function_declaration',
  'class_declaration',
  'abstract_class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
  'internal_module',
  'method_definition',
  'method_signature',
  'abstract_method_signature',
  'public_field_definition',
  'variable_declarator',
])

function kind(node: SgNode | null): string {
  return node ? String(node.kind()) : ''
}

function isDeclaration(node: SgNode): boolean {
  return DECLARATIONS.has(kind(node))
}

/** Declarations below `scope`, shallowest first, so `Parser.parse` prefers the method over nested helpers. */
function declarations(scope: SgNode): SgNode[] {
  const result: SgNode[] = []
  let level = scope.children()
  while (level.length > 0) {
    result.push(...level.filter(isDeclaration))
    level = level.flatMap(node => node.children())
  }
  return result
}

/** The statement a declaration belongs to: `const f = ...` for a declarator, with its `export`. */
function statement(node: SgNode): SgNode {
  const parent = node.parent()
  const outer = kind(node) === 'variable_declarator' && /^(lexical|variable)_declaration$/.test(kind(parent)) ? parent! : node
  const exported = outer.parent()
  return kind(exported) === 'export_statement' ? exported! : outer
}

function location(file: string, lines: string[], node: SgNode): ResolvedLocation {
  const { start, end } = statement(node).range()
  return locate(file, lines, start.line + 1, end.line + 1)
}

/**
 * `symbol:<file>#<name>[.<member>...]`: a declaration found by name in the
 * syntax tree (P-11), for code that cannot carry region markers. Supports
 * TypeScript and JavaScript files.
 */
export const symbolResolver: AnchorResolver = {
  scheme: 'symbol',
  async resolve(anchor, src, recorded, ref) {
    const target = splitTarget(anchor)
    if (!target) return { status: 'lost', message: `malformed anchor "${anchor}": expected symbol:<file>#<name>` }
    const lang = LANGS[target.file.split('.').pop() ?? '']
    if (!lang) return { status: 'lost', message: `symbol anchors support ${Object.keys(LANGS).map(e => `.${e}`).join(' ')} files, not ${target.file}` }
    const text = await src.read(target.file, ref)
    const at = ref ? ` at ${ref}` : ''
    if (text === undefined) return { status: 'lost', message: `${target.file} not found${at}` }

    const lines = text.split(/\r?\n/)
    const root = parse(lang, text).root()
    let node: SgNode | undefined = root
    for (const name of target.name.split('.')) {
      node = declarations(node).find(d => d.field('name')?.text() === name)
      if (!node) break
    }
    if (node) return found(location(target.file, lines, node), recorded)
    const candidates = declarations(root).map(d => location(target.file, lines, d))
    return notFound(`symbol "${target.name}" not found in ${target.file}${at}`, candidates, recorded)
  },
}
