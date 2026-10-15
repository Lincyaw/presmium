# Helpers loaded into Pyodide by pyodide.worker.ts. Every run gets fresh globals;
# results are returned as JSON strings so no Python objects cross into JavaScript.
import ast
import contextlib
import io
import json
import linecache
import os
import sys
import traceback

_PM_FILE = '<presmium>'


class _PmStop(BaseException):
    """Raised by the tracer when the event limit is reached."""


def _pm_prepare(code, args_json, stdin, files_json):
    for path, content in json.loads(files_json).items():
        folder = os.path.dirname(path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with open(path, 'w') as f:
            f.write(content)
    sys.stdin = io.StringIO(stdin)
    linecache.cache[_PM_FILE] = (len(code), None, code.splitlines(True), _PM_FILE)
    scope = {'__name__': '__main__'}
    # Arguments that read as Python literals (10, 0.5, [1, 2]) keep their type; others stay strings.
    for name, raw in json.loads(args_json).items():
        try:
            scope[name] = ast.literal_eval(raw)
        except (ValueError, SyntaxError, TypeError, MemoryError, RecursionError):
            scope[name] = raw
    return compile(code, _PM_FILE, 'exec'), scope


def _pm_error():
    """The current exception's traceback, starting at the user's code."""
    etype, value, tb = sys.exc_info()
    while tb is not None and tb.tb_frame.f_code.co_filename != _PM_FILE:
        tb = tb.tb_next
    return ''.join(traceback.format_exception(etype, value, tb))


def _pm_run(code, args_json, stdin, files_json, _max_events):
    out, err = io.StringIO(), io.StringIO()
    exit_code = 0
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        try:
            program, scope = _pm_prepare(code, args_json, stdin, files_json)
            exec(program, scope)
        except SystemExit as e:
            exit_code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
        except BaseException:
            err.write(_pm_error())
            exit_code = 1
    return json.dumps({'stdout': out.getvalue(), 'stderr': err.getvalue(), 'exitCode': exit_code})


def _pm_trace(code, args_json, stdin, files_json, max_events):
    """Runs the code once, recording each executed line of it with the output accumulated after the line ran."""
    out = io.StringIO()
    events = []
    truncated = False

    def tracer(frame, event, _arg):
        nonlocal truncated
        if frame.f_code.co_filename != _PM_FILE:
            return None
        if event == 'line':
            if events:
                events[-1]['output'] = out.getvalue()
            if len(events) >= max_events:
                truncated = True
                raise _PmStop()
            events.append({'line': frame.f_lineno, 'output': ''})
        return tracer

    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
        try:
            program, scope = _pm_prepare(code, args_json, stdin, files_json)
            sys.settrace(tracer)
            exec(program, scope)
        except (_PmStop, SystemExit):
            pass
        except BaseException:
            out.write(_pm_error())
        finally:
            sys.settrace(None)
    if events:
        events[-1]['output'] = out.getvalue()
    return json.dumps({'events': events, 'truncated': truncated, 'output': out.getvalue()})
