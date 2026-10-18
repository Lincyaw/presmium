import type { RunRequest, RunResult } from '@presmium/kernel'
import type { ClassroomMessages } from './messages.ts'
import type { Place } from './place.ts'

const MARKER = '@@presmium-check@@'
const SUBMISSION = 'submission.py'
const CHECKS = 'checks.py'

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

export function checkRequest(code: string, checks: string, timeoutMs?: number): RunRequest {
  return { lang: 'python', code: CHECK_PROGRAM, files: { [SUBMISSION]: code, [CHECKS]: checks }, ...timeoutMs ? { timeoutMs } : {} }
}

export interface CheckError {
  type: string
  message: string
  line?: number
  kind: string
  hint: string
}

export interface CheckCase {
  line: number
  code: string
  ok: boolean
  error?: CheckError
}

export interface CheckReport {
  status: 'passed' | 'failed' | 'error'
  passed: number
  total: number
  cases: CheckCase[]
  error?: CheckError
  output: string
}

export function typicalError(type: string, message: string, t: ClassroomMessages, line?: number): CheckError {
  const [kind, hint] = t.exercise.typical[type] ?? [type, t.exercise.unknown]
  return { type, message, ...line ? { line } : {}, kind, hint }
}

interface RawError { type: string, message: string, line?: number | null }
interface RawReport {
  error: RawError | null
  cases: { line: number, code: string, ok: boolean, error?: RawError }[]
}

export function checkReport(result: RunResult, t: ClassroomMessages): CheckReport {
  const checkError = (raw: RawError) => typicalError(raw.type, raw.message, t, raw.line ?? undefined)
  const at = result.stdout.lastIndexOf(`\n${MARKER}`)
  const output = at >= 0 ? result.stdout.slice(0, at) : result.stdout
  const failed = (error: CheckError): CheckReport => ({ status: 'error', passed: 0, total: 0, cases: [], error, output })
  if (result.timedOut) return failed(typicalError('Timeout', result.stderr.trim(), t))
  let raw: RawReport | undefined
  try {
    if (at >= 0) raw = JSON.parse(result.stdout.slice(at + MARKER.length + 1)) as RawReport
  } catch {}
  if (!raw || !Array.isArray(raw.cases)) {
    const [kind, hint] = t.exercise.unchecked
    return failed({ type: 'Error', message: result.stderr.trim() || t.exercise.noResult, kind, hint })
  }
  if (raw.error) return failed(checkError(raw.error))
  const cases = raw.cases.map(c => ({ line: c.line, code: c.code, ok: c.ok, ...c.error ? { error: checkError(c.error) } : {} }))
  const passed = cases.filter(c => c.ok).length
  return { status: passed === cases.length ? 'passed' : 'failed', passed, total: cases.length, cases, output }
}

export interface Submission extends Place {
  exercise: string
  participant: string
  name: string
  status: CheckReport['status']
  passed: number
  total: number
  kinds: string[]
  at: number
}

export function submissionId(exercise: string, participant: string): string {
  return `${exercise}:${participant}`
}

export function reportKinds(report: CheckReport): string[] {
  const errors = report.error ? [report.error] : report.cases.flatMap(c => (c.error ? [c.error] : []))
  return [...new Set(errors.map(e => e.kind))]
}

export interface ExerciseSummary {
  submitted: number
  passed: number
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

export function summaryText(summary: ExerciseSummary, t: ClassroomMessages): string {
  const { exercise, list, people } = t
  const common = summary.kinds.map(([kind, n]) => `${kind} ${people(n)}`).join(list)
  return exercise.summary(summary.submitted, summary.passed) + (common ? exercise.common(common) : '')
}
