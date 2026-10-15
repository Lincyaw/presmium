/**
 * Exercise checks (P-65). A submission runs through the `executor` service as
 * one Python program, `CHECK_PROGRAM`: it runs the learner's code, then every
 * top-level statement of the checks on its own (usually an `assert`), and
 * prints a JSON report after a marker line. `checkReport` reads it and names
 * the typical error behind each failure.
 */
import type { RunRequest, RunResult } from '@presmium/kernel'
import type { Place } from './place.ts'

const MARKER = '@@presmium-check@@'
const SUBMISSION = 'submission.py'
const CHECKS = 'checks.py'

/** The checking program; the learner's code and the checks are files next to it. */
export const CHECK_PROGRAM = `import ast as _pm_ast, json as _pm_json


def _pm_describe(error):
    line = error.lineno if isinstance(error, SyntaxError) and error.filename == ${JSON.stringify(SUBMISSION)} else None
    tb = error.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == ${JSON.stringify(SUBMISSION)}:
            line = tb.tb_lineno
        tb = tb.tb_next
    return {'type': type(error).__name__, 'message': str(error), 'line': line}


def _pm_check():
    with open(${JSON.stringify(SUBMISSION)}, encoding='utf-8') as f:
        submission = f.read()
    with open(${JSON.stringify(CHECKS)}, encoding='utf-8') as f:
        checks = f.read()
    scope = {'__name__': '__main__'}
    try:
        exec(compile(submission, ${JSON.stringify(SUBMISSION)}, 'exec'), scope)
    except BaseException as error:
        return {'error': _pm_describe(error), 'cases': []}
    cases = []
    for node in _pm_ast.parse(checks).body:
        case = {'line': node.lineno, 'code': _pm_ast.get_source_segment(checks, node) or '', 'ok': True}
        try:
            exec(compile(_pm_ast.Module(body=[node], type_ignores=[]), ${JSON.stringify(CHECKS)}, 'exec'), scope)
        except BaseException as error:
            case['ok'] = False
            case['error'] = _pm_describe(error)
        cases.append(case)
    return {'error': None, 'cases': cases}


print('\\n${MARKER}' + _pm_json.dumps(_pm_check(), ensure_ascii=False))
`

/** The run that checks `code` against `checks`. */
export function checkRequest(code: string, checks: string, timeoutMs?: number): RunRequest {
  return { lang: 'python', code: CHECK_PROGRAM, files: { [SUBMISSION]: code, [CHECKS]: checks }, ...timeoutMs ? { timeoutMs } : {} }
}

export interface CheckError {
  /** Python exception type, or `Timeout`. */
  type: string
  message: string
  /** Line in the learner's code, when the error comes from there. */
  line?: number
  /** The typical error, e.g. `除以零`, and what to look at. */
  kind: string
  hint: string
}

export interface CheckCase {
  /** Line of the check in the checks. */
  line: number
  code: string
  ok: boolean
  error?: CheckError
}

export interface CheckReport {
  /** `error`: the code did not run to the checks (syntax error, an error at the top level, a timeout). */
  status: 'passed' | 'failed' | 'error'
  passed: number
  total: number
  cases: CheckCase[]
  error?: CheckError
  /** What the code printed. */
  output: string
}

const TYPICAL: Record<string, [kind: string, hint: string]> = {
  SyntaxError: ['语法错误', '检查括号、冒号与引号是否成对'],
  IndentationError: ['缩进错误', '同一代码块的缩进要一致'],
  TabError: ['缩进错误', '不要混用空格与制表符'],
  NameError: ['名字未定义', '检查拼写，变量与函数要先定义再使用'],
  NotImplementedError: ['尚未实现', '把占位代码换成实现'],
  AssertionError: ['结果不对', '对照校验用例检查返回值'],
  TypeError: ['类型不匹配', '检查参数个数与值的类型，例如是否返回了 None'],
  ZeroDivisionError: ['除以零', '先处理除数为零的情况，例如空列表'],
  IndexError: ['下标越界', '检查下标范围与空序列'],
  KeyError: ['键不存在', '先检查字典中是否有这个键'],
  AttributeError: ['属性不存在', '检查对象的类型与属性名'],
  ValueError: ['取值不合法', '检查输入值的范围与格式'],
  RecursionError: ['递归太深', '检查递归的结束条件'],
  Timeout: ['运行超时', '可能有死循环，检查循环的结束条件'],
}

/** The typical error behind a Python exception type. */
export function typicalError(type: string, message: string, line?: number): CheckError {
  const [kind, hint] = TYPICAL[type] ?? [type, '查看错误信息']
  return { type, message, ...line ? { line } : {}, kind, hint }
}

interface RawError { type: string, message: string, line?: number | null }
interface RawReport {
  error: RawError | null
  cases: { line: number, code: string, ok: boolean, error?: RawError }[]
}

function checkError(raw: RawError): CheckError {
  return typicalError(raw.type, raw.message, raw.line ?? undefined)
}

/** The report of a checking run. */
export function checkReport(result: RunResult): CheckReport {
  const at = result.stdout.lastIndexOf(`\n${MARKER}`)
  const output = at >= 0 ? result.stdout.slice(0, at) : result.stdout
  const failed = (error: CheckError): CheckReport => ({ status: 'error', passed: 0, total: 0, cases: [], error, output })
  if (result.timedOut) return failed(typicalError('Timeout', result.stderr.trim()))
  let raw: RawReport | undefined
  try {
    if (at >= 0) raw = JSON.parse(result.stdout.slice(at + MARKER.length + 1)) as RawReport
  } catch {}
  if (!raw || !Array.isArray(raw.cases)) {
    return failed({ type: 'Error', message: result.stderr.trim() || '校验程序没有给出结果', kind: '无法校验', hint: '校验没有运行完，查看错误信息' })
  }
  if (raw.error) return failed(checkError(raw.error))
  const cases = raw.cases.map(c => ({ line: c.line, code: c.code, ok: c.ok, ...c.error ? { error: checkError(c.error) } : {} }))
  const passed = cases.filter(c => c.ok).length
  return { status: passed === cases.length ? 'passed' : 'failed', passed, total: cases.length, cases, output }
}

/** A learner's last submission of an exercise (collection `submissions`, by `submissionId`), for the presenter view. */
export interface Submission extends Place {
  exercise: string
  participant: string
  name: string
  status: CheckReport['status']
  passed: number
  total: number
  /** Typical errors of this submission. */
  kinds: string[]
  at: number
}

export function submissionId(exercise: string, participant: string): string {
  return `${exercise}:${participant}`
}

/** The typical errors of a report, each once. */
export function reportKinds(report: CheckReport): string[] {
  const errors = report.error ? [report.error] : report.cases.flatMap(c => (c.error ? [c.error] : []))
  return [...new Set(errors.map(e => e.kind))]
}

export interface ExerciseSummary {
  submitted: number
  passed: number
  /** Typical errors and how many learners' last submission had them, most frequent first. */
  kinds: [kind: string, count: number][]
}

export function summarize(submissions: Submission[]): ExerciseSummary {
  const counts = new Map<string, number>()
  for (const kind of submissions.flatMap(s => s.kinds)) counts.set(kind, (counts.get(kind) ?? 0) + 1)
  return {
    submitted: submissions.length,
    passed: submissions.filter(s => s.status === 'passed').length,
    kinds: [...counts].sort((a, b) => b[1] - a[1]),
  }
}
