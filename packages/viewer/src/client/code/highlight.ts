import { languageId } from '@lincyaw/kernel'
import type { HighlighterCore } from 'shiki/core'

type Loader = () => Promise<unknown>

const GRAMMARS: Record<string, Loader> = import.meta.env.SSR ? {} : {
  python: () => import('shiki/langs/python.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  shellscript: () => import('shiki/langs/shellscript.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  wgsl: () => import('shiki/langs/wgsl.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
}

const ALIASES: Record<string, string> = {
  mts: 'typescript',
  sh: 'shellscript',
  bash: 'shellscript',
  shell: 'shellscript',
  zsh: 'shellscript',
  yml: 'yaml',
  md: 'markdown',
  'c++': 'cpp',
  rs: 'rust',
  rb: 'ruby',
}

export const SHIKI_THEMES = { light: 'github-light', dark: 'github-dark' } as const

let highlighter: Promise<HighlighterCore> | undefined
const loading = new Map<string, Promise<void>>()

function load(): Promise<HighlighterCore> {
  if (import.meta.env.SSR) return new Promise(() => {})
  highlighter ??= Promise.all([import('shiki/core'), import('shiki/engine/javascript')]).then(([core, engine]) =>
    core.createHighlighterCore({
      themes: [import('shiki/themes/github-light.mjs'), import('shiki/themes/github-dark.mjs')],
      langs: [],
      engine: engine.createJavaScriptRegexEngine({ forgiving: true }),
    }))
  return highlighter
}

function grammarOf(lang: string): string | undefined {
  const id = languageId(lang)
  const name = ALIASES[id] ?? id
  return name in GRAMMARS ? name : undefined
}

export async function highlighterFor(lang: string): Promise<{ highlighter: HighlighterCore, lang: string } | undefined> {
  const name = grammarOf(lang)
  if (!name) return undefined
  const core = await load()
  if (!loading.has(name)) loading.set(name, core.loadLanguage(GRAMMARS[name]!() as never))
  await loading.get(name)
  return { highlighter: core, lang: name }
}
