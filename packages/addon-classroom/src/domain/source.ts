/**
 * The bodies of `{quiz}` and `{exercise}` as authors write them: Markdown for
 * the prompt, plus a task list (the options) or code blocks (the starter code
 * and the checks).
 */

/** `- [ ] option` or `- [x] option`; `x` marks a right option. */
const OPTION = /^\s*[-*+]\s+\[([ xX])\]\s+(.*?)\s*$/
/** An opening code fence and its info string. */
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

export interface QuizSource {
  /** Markdown before and around the options. */
  prompt: string
  options: string[]
  answer: number[]
}

export function parseQuiz(body: string): QuizSource {
  const prompt: string[] = []
  const options: string[] = []
  const answer: number[] = []
  for (const line of body.split('\n')) {
    const option = OPTION.exec(line)
    if (!option) {
      prompt.push(line)
      continue
    }
    if (option[1] !== ' ') answer.push(options.length)
    options.push(option[2]!)
  }
  return { prompt: prompt.join('\n').trim(), options, answer }
}

export interface CodeSource {
  lang: string
  value: string
}

export interface ExerciseSource {
  /** Markdown outside the code blocks; MyST directives in it stay. */
  prompt: string
  /** Code blocks in order: the starter code, then the checks. */
  code: CodeSource[]
}

export function parseExercise(body: string): ExerciseSource {
  const prompt: string[] = []
  const code: CodeSource[] = []
  const lines = body.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const fence = FENCE.exec(lines[i]!)
    // `{name}` after the fence opens a directive, which belongs to the prompt.
    if (!fence || fence[2]!.trim().startsWith('{')) {
      prompt.push(lines[i]!)
      continue
    }
    const [, marker] = fence
    const close = new RegExp(`^ {0,3}${marker![0] === '`' ? '`' : '~'}{${marker!.length},}\\s*$`)
    let end = i + 1
    while (end < lines.length && !close.test(lines[end]!)) end++
    code.push({ lang: fence[2]!.trim().split(/\s+/)[0] ?? '', value: lines.slice(i + 1, end).join('\n') })
    i = end
  }
  return { prompt: prompt.join('\n').trim(), code }
}
