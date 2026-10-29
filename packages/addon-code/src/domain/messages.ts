import type { Locale } from '@lincyaw/kernel'

/** Why a {code-ref} could not be read, as a code its text is chosen by in the document's language. */
export type CodeRefProblem =
  | { code: 'anchor' }
  | { code: 'empty-option', option: string }
  | { code: 'empty-list', option: string }
  | { code: 'variants-count' }
  | { code: 'variants-combined' }
  | { code: 'step-region', step: string, regions: string[] }

export class CodeRefError extends Error {
  readonly problem: CodeRefProblem
  constructor(problem: CodeRefProblem) {
    super(CODE_MESSAGES.en.problem(problem))
    this.problem = problem
  }
}

const zh = {
  invalid: (reason: string) => `无法读取 {code-ref}：${reason}`,
  stepHint: '请为每个步骤加上嵌套的 #region 标记。',
  problem: (problem: CodeRefProblem): string => {
    switch (problem.code) {
      case 'anchor': return '参数须是“方案:目标”形式的锚点，例如 region:src/app.ts#main。'
      case 'empty-option': return `:${problem.option}: 需要一个值。`
      case 'empty-list': return `:${problem.option}: 需要至少一个名称。`
      case 'variants-count': return ':variants: 需要至少两个版本。'
      case 'variants-combined': return ':variants: 不能与 :pin: 或 :steps: 同时使用。'
      case 'step-region': return `步骤“${problem.step}”不是所引用代码中的 #region（可用：${problem.regions.join('、') || '无'}）。`
    }
  },
}

const en: typeof zh = {
  invalid: reason => `Couldn’t read {code-ref}: ${reason}`,
  stepHint: 'Add nested #region markers for each step.',
  problem: (problem) => {
    switch (problem.code) {
      case 'anchor': return 'The argument must be an anchor scheme:target, such as region:src/app.ts#main.'
      case 'empty-option': return `:${problem.option}: needs a value.`
      case 'empty-list': return `:${problem.option}: needs at least one name.`
      case 'variants-count': return ':variants: needs at least two versions.'
      case 'variants-combined': return ':variants: can’t be combined with :pin: or :steps:.'
      case 'step-region': return `Step “${problem.step}” is not a #region inside the referenced code (regions: ${problem.regions.join(', ') || 'none'}).`
    }
  },
}

export const CODE_MESSAGES: Record<Locale, typeof zh> = { 'zh-CN': zh, en }
