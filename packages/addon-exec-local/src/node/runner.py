# The program of a Python request to Presmium's container executor (P-22): run in a fresh
# container of the devcontainer image as `python3 -c <this file>`, in a working directory of its
# own that already holds the request's files. The request comes as JSON on stdin. As in the
# browser and at compile time (the runner of the execution plugin), parameters that read as
# Python literals become variables of their type and the others strings, the request's stdin is
# the program's, and the result {stdout, stderr, exitCode} goes apart from what the program
# prints: to the file the request names.
import ast
import contextlib
import io
import json
import linecache
import sys
import traceback

_PM_FILE = '<presmium>'


def _pm_main():
    request = json.loads(sys.stdin.buffer.read().decode('utf-8'))
    code = request['code']
    out, err = io.StringIO(), io.StringIO()
    exit_code = 0
    sys.stdin = io.StringIO(request.get('stdin') or '')
    # The workspace's modules stay importable, as from its folder.
    if request.get('workspace'):
        sys.path.insert(1, request['workspace'])
    linecache.cache[_PM_FILE] = (len(code), None, code.splitlines(True), _PM_FILE)
    scope = {'__name__': '__main__'}
    for name, raw in (request.get('args') or {}).items():
        try:
            scope[name] = ast.literal_eval(raw)
        except (ValueError, SyntaxError, TypeError, MemoryError, RecursionError):
            scope[name] = raw
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            exec(compile(code, _PM_FILE, 'exec'), scope)
        except SystemExit as e:
            exit_code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
        except BaseException:
            etype, value, tb = sys.exc_info()
            while tb is not None and tb.tb_frame.f_code.co_filename != _PM_FILE:
                tb = tb.tb_next
            err.write(''.join(traceback.format_exception(etype, value, tb)))
            exit_code = 1
    with open(request['result'], 'w', encoding='utf-8') as f:
        json.dump({'stdout': out.getvalue(), 'stderr': err.getvalue(), 'exitCode': exit_code}, f)


_pm_main()
