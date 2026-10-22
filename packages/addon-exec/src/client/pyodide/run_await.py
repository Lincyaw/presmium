# Top-level `await` for Python in the browser: the asynchronous form of the WebGPU bridge
# (`await presmium_gpu.run(...)`) and other awaitables Pyodide gives (`pyodide.http`).
# Loaded into the Pyodide worker after the shared runner (@lincyaw/kernel/runner.py), whose
# helpers it uses: `_pm_run_await` runs code as `_pm_run` does, with the same outputs (the value of a
# last expression too), session and isolation, but compiled to allow `await` at its top level, and
# the worker awaits it.
import ast as _pm_ast
import inspect as _pm_inspect

_PM_AWAIT = _pm_ast.PyCF_ALLOW_TOP_LEVEL_AWAIT


def _pm_awaits(code):
    """Whether the code awaits at its top level: it compiles only when that is allowed."""
    try:
        compile(code, _PM_FILE, 'exec')
        return False
    except SyntaxError:
        pass
    try:
        return bool(compile(code, _PM_FILE, 'exec', flags=_PM_AWAIT).co_flags & _pm_inspect.CO_COROUTINE)
    except SyntaxError:
        return False


async def _pm_evaluate(code, scope):
    """Runs compiled code; awaits it when it awaits at its top level."""
    value = eval(code, scope)
    return await value if code.co_flags & _pm_inspect.CO_COROUTINE else value


async def _pm_run_await(code, args_json, stdin, files_json, _max_events, session_name=None):
    global _PM_CURRENT
    outputs = _PmOutputs()
    exit_code = 0
    session = _pm_session(session_name) if session_name else None
    scope = session['scope'] if session is not None else {}
    _PM_CURRENT = outputs
    try:
        with _PmIsolation(None, session), contextlib.redirect_stdout(_PmStream(outputs, 'stdout')), contextlib.redirect_stderr(_PmStream(outputs, 'stderr')):
            try:
                # The arguments, stdin and files as the runner gives them; then the code, with await.
                _pm_prepare('', args_json, stdin, files_json, scope)
                linecache.cache[_PM_FILE] = (len(code), None, code.splitlines(True), _PM_FILE)
                program, last = _pm_split(code, _PM_AWAIT)
                await _pm_evaluate(program, scope)
                if last is not None:
                    _pm_result(outputs, await _pm_evaluate(last, scope))
                _pm_figures()
            except SystemExit as e:
                exit_code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
            except BaseException:
                outputs.error(*_pm_user_traceback())
                exit_code = 1
    finally:
        _PM_CURRENT = None
    return json.dumps({'stdout': ''.join(outputs.text['stdout']), 'stderr': ''.join(outputs.text['stderr']), 'exitCode': exit_code, 'outputs': outputs.items})
