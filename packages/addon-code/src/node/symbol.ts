import { errorMessage } from '@lincyaw/kernel'
import type { AnchorResolver, AnchorString, SourceReader } from '@lincyaw/kernel'
import python from '@ast-grep/lang-python'
import { Lang, parse, registerDynamicLanguage } from '@ast-grep/napi'
import type { SgNode } from '@ast-grep/napi'
import { codeFingerprint, found, locate, notFound, splitTarget } from '../domain/index.ts'
import type { Candidate } from '../domain/index.ts'

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

const WRAPPERS = new Set(['export_statement', 'decorated_definition', 'expression_statement'])

function kind(node: SgNode | null): string {
  return node ? String(node.kind()) : ''
}

function nameOf(node: SgNode): SgNode | null {
  return node.field('name') ?? (kind(node) === 'assignment' ? node.field('left') : null)
}

function findDeclaration(scope: SgNode, name: string): SgNode | undefined {
  let level = scope.children()
  while (level.length > 0) {
    const hit = level.find(node => DECLARATIONS.has(kind(node)) && nameOf(node)?.text() === name)
    if (hit) return hit
    level = level.flatMap(node => node.children())
  }
  return undefined
}

function declarations(scope: SgNode): SgNode[] {
  const result: SgNode[] = []
  let level = scope.children()
  while (level.length > 0) {
    result.push(...level.filter(node => DECLARATIONS.has(kind(node)) && nameOf(node)))
    level = level.flatMap(node => node.children())
  }
  return result
}

function statement(node: SgNode): SgNode {
  const parent = node.parent()
  const outer = kind(node) === 'variable_declarator' && /^(lexical|variable)_declaration$/.test(kind(parent)) ? parent! : node
  const wrapper = outer.parent()
  return wrapper && WRAPPERS.has(kind(wrapper)) ? wrapper : outer
}

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

type Tree = { failure: string } | { target: NonNullable<ReturnType<typeof splitTarget>>, at: string, lines: string[], root: SgNode }

async function syntaxTree(anchor: AnchorString, src: SourceReader, ref: string | undefined, expected: string): Promise<Tree> {
  const target = splitTarget(anchor)
  if (!target) return { failure: `malformed anchor "${anchor}": expected ${expected}` }
  const lang = LANGS[target.file.split('.').pop() ?? '']
  if (!lang) return { failure: `${target.scheme} anchors support ${Object.keys(LANGS).map(e => `.${e}`).join(' ')} files, not ${target.file}` }
  const at = ref ? ` at ${ref}` : ''
  const text = await src.read(target.file, ref)
  if (text === undefined) return { failure: `${target.file} not found${at}` }
  return { target, at, lines: text.split(/\r?\n/), root: parse(lang, text).root() }
}

export const symbolResolver: AnchorResolver = {
  scheme: 'symbol',
  async resolve(anchor, src, recorded, ref) {
    const tree = await syntaxTree(anchor, src, ref, 'symbol:<file>#<name>')
    if ('failure' in tree) return { status: 'lost', message: tree.failure }
    const { target, at, lines, root } = tree
    let node: SgNode | undefined = root
    for (const name of target.name.split('.')) {
      node = findDeclaration(node, name)
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

function span(file: string, lines: string[], node: SgNode): Candidate {
  const { start, end } = node.range()
  const location = locate(file, lines, start.line + 1, end.line + 1)
  return { location, print: codeFingerprint(location.text) }
}

function spans(file: string, lines: string[], root: SgNode): Candidate[] {
  const seen = new Map<string, Candidate>()
  const visit = (node: SgNode) => {
    const { start, end } = node.range()
    const key = `${start.line}:${end.line}`
    if (!seen.has(key)) seen.set(key, span(file, lines, node))
    node.children().forEach(visit)
  }
  visit(root)
  return [...seen.values()]
}

export const patternResolver: AnchorResolver = {
  scheme: 'pattern',
  async resolve(anchor, src, recorded, ref) {
    const tree = await syntaxTree(anchor, src, ref, 'pattern:<file>#<pattern>')
    if ('failure' in tree) return { status: 'lost', message: tree.failure }
    const { target, at, lines, root } = tree
    let match: SgNode | null
    try {
      match = root.find(target.name)
    } catch (error) {
      return { status: 'lost', message: `invalid pattern "${target.name}": ${errorMessage(error)}` }
    }
    if (match) return found(span(target.file, lines, match).location, recorded)
    return notFound(`pattern "${target.name}" matches nothing in ${target.file}${at}`, recorded ? spans(target.file, lines, root) : [], recorded)
  },
}
