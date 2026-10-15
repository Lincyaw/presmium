import type { AnchorResolver } from '@presmium/kernel'
import python from '@ast-grep/lang-python'
import { Lang, parse, registerDynamicLanguage } from '@ast-grep/napi'
import type { SgNode } from '@ast-grep/napi'
import { codeFingerprint, found, locate, notFound, splitTarget } from '../domain/index.ts'
import type { Candidate } from '../domain/index.ts'

// Python ships as a prebuilt tree-sitter parser loaded at runtime.
registerDynamicLanguage({ python })

const LANGS: Record<string, string> = {
  ts: Lang.TypeScript,
  mts: Lang.TypeScript,
  cts: Lang.TypeScript,
  tsx: Lang.Tsx,
  js: Lang.JavaScript,
  mjs: Lang.JavaScript,
  cjs: Lang.JavaScript,
  jsx: Lang.JavaScript,
  py: 'python',
  pyi: 'python',
}

/** Named declarations a symbol path can address, in the TypeScript, JavaScript and Python grammars. */
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
  'function_definition',
  'class_definition',
  'assignment',
])

/** Nodes around a declaration that belong to it: `export`, Python decorators, the statement of an assignment. */
const WRAPPERS = new Set(['export_statement', 'decorated_definition', 'expression_statement'])

function kind(node: SgNode | null): string {
  return node ? String(node.kind()) : ''
}

/** The declared name: `name` in most declarations, the target of a Python assignment. */
function nameOf(node: SgNode): SgNode | null {
  return node.field('name') ?? (kind(node) === 'assignment' ? node.field('left') : null)
}


/** Declarations below `scope`, shallowest first, so `Parser.parse` prefers the method over nested helpers. */
function declarations(scope: SgNode): SgNode[] {
  const result: SgNode[] = []
  let level = scope.children()
  while (level.length > 0) {
    result.push(...level.filter(node => DECLARATIONS.has(kind(node)) && nameOf(node)))
    level = level.flatMap(node => node.children())
  }
  return result
}

/** The whole statement of a declaration: `const f = ...` for a declarator, with its wrappers. */
function statement(node: SgNode): SgNode {
  const parent = node.parent()
  const outer = kind(node) === 'variable_declarator' && /^(lexical|variable)_declaration$/.test(kind(parent)) ? parent! : node
  const wrapper = outer.parent()
  return wrapper && WRAPPERS.has(kind(wrapper)) ? wrapper : outer
}

/** A declaration's location, fingerprinted without its name so that a renamed declaration stays recognizable. */
function describe(file: string, lines: string[], node: SgNode): Candidate {
  const name = nameOf(node)!
  const { start, end } = statement(node).range()
  const location = locate(file, lines, start.line + 1, end.line + 1)
  const text = location.text.split('\n')
  const at = name.range().start
  const line = at.line - start.line
  text[line] = `${text[line]!.slice(0, at.column)}_${text[line]!.slice(at.column + name.text().length)}`
  return { location, print: codeFingerprint(text.join('\n')) }
}

/**
 * `symbol:<file>#<name>[.<member>...]`: a declaration found by name in the
 * syntax tree (P-11), for code that cannot carry region markers. Supports
 * TypeScript, JavaScript and Python files.
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
      node = declarations(node).find(d => nameOf(d)!.text() === name)
      if (!node) break
    }
    if (node) {
      const { location, print } = describe(target.file, lines, node)
      return found(location, recorded, print)
    }
    const candidates = declarations(root).map(d => describe(target.file, lines, d))
    return notFound(`symbol "${target.name}" not found in ${target.file}${at}`, candidates, recorded)
  },
}
