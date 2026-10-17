# The Python runner of Presmium (docs/architecture.md 9.2), published by the kernel as
# `@presmium/kernel/runner.py` and shared by the plugins that run Python: the execution plugin
# loads it into Pyodide in the browser and runs it with the local python3 at compile time, the
# local environment plugin runs it in the container. The kernel itself never reads it.
#
# A run gives the parameters as variables (read back by `_pm_arg`: literals keep their type), the
# request's stdin to the program and its files in the working directory. Its result is JSON: the
# text streams `stdout` and `stderr`, the exit code, and the rich outputs in nbformat form
# (`outputs`: the streams in order, what `display()` shows, matplotlib figures, the value of a
# last expression as Jupyter shows it, the error), docs/ir.md 6.1.
#
# Without a session every run gets fresh globals, and what it changes in the interpreter is undone
# afterwards (_PmIsolation), so one run in the browser's long-lived interpreter cannot affect the
# next. The runs of one session share their globals and working directory until `_pm_end`.
#
# At compile time the process reads its input from `.presmium/request.json` in the run directory,
# its working directory, and writes the result of run i to `.presmium/result-<i>.json` there
# (`_pm_main`): no standard input or extra file descriptor, which a process sandbox does not pass on.
import ast
import base64
import builtins
import contextlib
import importlib.util
import io
import json
import linecache
import os
import shutil
import sys
import tempfile
import traceback
import types

_PM_FILE = '<presmium>'
# Session name -> {'scope': the globals, 'dir': the working directory}.
_PM_SESSIONS = {}
# The outputs of the run under way, which display() and plt.show() add to.
_PM_CURRENT = None


class _PmStop(BaseException):
    """Raised by the tracer when the event limit is reached."""


class _PmOutputs:
    """The outputs of one run in order (nbformat), with the text streams also kept apart."""

    def __init__(self):
        self.items = []
        self.text = {'stdout': [], 'stderr': []}

    def stream(self, name, text):
        if not text:
            return
        self.text[name].append(text)
        last = self.items[-1] if self.items else None
        if last is not None and last['output_type'] == 'stream' and last['name'] == name:
            last['text'] += text
        else:
            self.items.append({'output_type': 'stream', 'name': name, 'text': text})

    def display(self, data, kind='display_data'):
        self.items.append({'output_type': kind, 'data': data, 'metadata': {}})

    def error(self, etype, value, tb):
        text = ''.join(traceback.format_exception(etype, value, tb))
        self.text['stderr'].append(text)
        self.items.append({'output_type': 'error', 'ename': etype.__name__, 'evalue': str(value), 'traceback': text.rstrip('\n').split('\n')})


class _PmStream(io.TextIOBase):
    """sys.stdout or sys.stderr of a run: what the program writes becomes a stream output."""

    def __init__(self, outputs, name):
        super().__init__()
        self._outputs = outputs
        self._name = name

    @property
    def encoding(self):
        return 'utf-8'

    def writable(self):
        return True

    def write(self, text):
        self._outputs.stream(self._name, str(text))
        return len(text)


_PM_REPRS = [
    ('text/html', '_repr_html_'),
    ('text/markdown', '_repr_markdown_'),
    ('text/latex', '_repr_latex_'),
    ('image/svg+xml', '_repr_svg_'),
    ('image/png', '_repr_png_'),
    ('image/jpeg', '_repr_jpeg_'),
    ('application/json', '_repr_json_'),
]


def _pm_value(value):
    """A MIME value as JSON holds it: binary data in base64."""
    if isinstance(value, (bytes, bytearray)):
        return base64.b64encode(value).decode('ascii')
    return value


def _pm_bundle(obj):
    """The MIME bundle of an object, as Jupyter builds it from its `_repr_*_` methods; always with text/plain."""
    data = {}
    if not isinstance(obj, type):
        method = getattr(obj, '_repr_mimebundle_', None)
        if callable(method):
            try:
                found = method()
                if isinstance(found, tuple):
                    found = found[0]
                if isinstance(found, dict):
                    data.update({mime: _pm_value(value) for mime, value in found.items()})
            except Exception:
                pass
        for mime, name in _PM_REPRS:
            method = getattr(obj, name, None)
            if mime in data or not callable(method):
                continue
            try:
                value = method()
            except Exception:
                continue
            if isinstance(value, tuple):
                value = value[0]
            if value is not None:
                data[mime] = _pm_value(value)
    data.setdefault('text/plain', repr(obj))
    return data


def display(*objs, raw=False, **_options):
    """Shows objects as rich outputs (Jupyter's `display`); `raw=True` takes MIME bundles."""
    for obj in objs:
        data = dict(obj) if raw and isinstance(obj, dict) else _pm_bundle(obj)
        if _PM_CURRENT is not None:
            _PM_CURRENT.display({mime: _pm_value(value) for mime, value in data.items()})
        else:
            print(data.get('text/plain', ''))


class _PmDisplayObject:
    """The display objects of IPython.display that the runner provides: data of one MIME type."""
    mime = 'text/plain'
    binary = False

    def __init__(self, data=None, url=None, filename=None, **_options):
        if filename is not None:
            with open(filename, 'rb' if self.binary else 'r') as f:
                data = f.read()
        self.data = data
        self.url = url

    def _repr_mimebundle_(self, include=None, exclude=None):
        return {self.mime: _pm_value(self.data), 'text/plain': '<%s object>' % type(self).__name__}


class _PmMarkdown(_PmDisplayObject):
    mime = 'text/markdown'


class _PmHTML(_PmDisplayObject):
    mime = 'text/html'


class _PmLatex(_PmDisplayObject):
    mime = 'text/latex'


class _PmSVG(_PmDisplayObject):
    mime = 'image/svg+xml'


class _PmJSON(_PmDisplayObject):
    mime = 'application/json'


class _PmImage(_PmDisplayObject):
    binary = True

    def __init__(self, data=None, url=None, filename=None, format=None, **options):
        super().__init__(data, url, filename, **options)
        kind = (format or os.path.splitext(filename or '')[1].lstrip('.') or 'png').lower()
        self.mime = {'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'gif': 'image/gif', 'svg': 'image/svg+xml'}.get(kind, 'image/png')
        if self.mime == 'image/svg+xml' and isinstance(self.data, (bytes, bytearray)):
            self.data = self.data.decode('utf-8')


def _pm_figures():
    """The open matplotlib figures as PNG outputs, then closed (plt.show(), and the end of a run)."""
    plt = sys.modules.get('matplotlib.pyplot')
    if plt is None or _PM_CURRENT is None:
        return
    for number in plt.get_fignums():
        figure = plt.figure(number)
        data = io.BytesIO()
        figure.savefig(data, format='png', bbox_inches='tight')
        _PM_CURRENT.display({'image/png': base64.b64encode(data.getvalue()).decode('ascii'), 'text/plain': repr(figure)})
    plt.close('all')


class _PmModules:
    """
    The modules the runner provides, made when the code imports them, the same in the browser and
    at compile time (an installed IPython is not used): `IPython` and `IPython.display` with
    `display` and its display objects, for an IPython without a shell; `_presmium_matplotlib`,
    the matplotlib backend of the runs, which draws with Agg and shows the figures as outputs on
    plt.show() and at the end of a run, like Jupyter's inline backend.
    """

    @classmethod
    def find_spec(cls, name, _path=None, _target=None):
        if name in ('IPython', 'IPython.display', '_presmium_matplotlib'):
            return importlib.util.spec_from_loader(name, cls, is_package=name == 'IPython')
        return None

    @staticmethod
    def create_module(_spec):
        return None

    @staticmethod
    def exec_module(module):
        if module.__name__ == '_presmium_matplotlib':
            from matplotlib.backends.backend_agg import FigureCanvasAgg
            module.FigureCanvas = FigureCanvasAgg
            module.show = lambda *_args, **_kwargs: _pm_figures()
        elif module.__name__ == 'IPython':
            module.get_ipython = lambda: None
            # Newer than the versions whose shell matplotlib adjusts.
            module.version_info = (8, 24, 0, '')
        else:
            for name, value in [('display', display), ('Markdown', _PmMarkdown), ('HTML', _PmHTML), ('Latex', _PmLatex),
                                ('SVG', _PmSVG), ('JSON', _PmJSON), ('Image', _PmImage)]:
                setattr(module, name, value)


if _PmModules not in sys.meta_path:
    sys.meta_path.insert(0, _PmModules)


class _PmIsolation:
    """
    The working directory of a run and what it changes in the interpreter. Without a session the
    run gets a fresh directory (`dir`, or a new temporary one, removed afterwards) and the state it
    may change is restored; in a session the directory and the state persist.
    """

    def __init__(self, dir=None, session=None):
        self.given = dir
        self.session = session

    def __enter__(self):
        self.limit = sys.getrecursionlimit()
        self.path = list(sys.path)
        self.modules = set(sys.modules)
        self.builtins = dict(builtins.__dict__)
        self.stdin = sys.stdin
        self.cwd = os.getcwd()
        self.backend = os.environ.get('MPLBACKEND')
        if self.given is not None:
            self.dir = self.given
        elif self.session is not None:
            self.dir = self.session['dir']
        else:
            self.dir = tempfile.mkdtemp(prefix='presmium-run-')
        os.chdir(self.dir)
        os.environ['MPLBACKEND'] = 'module://_presmium_matplotlib'
        return self

    def __exit__(self, *_exc):
        sys.setrecursionlimit(self.limit)
        os.chdir(self.cwd)
        sys.stdin = self.stdin
        if self.backend is None:
            os.environ.pop('MPLBACKEND', None)
        else:
            os.environ['MPLBACKEND'] = self.backend
        if self.session is not None:
            return False
        if self.given is None:
            shutil.rmtree(self.dir, ignore_errors=True)
        sys.path[:] = self.path
        for name in set(sys.modules) - self.modules:
            del sys.modules[name]
        for name in set(builtins.__dict__) - set(self.builtins):
            del builtins.__dict__[name]
        builtins.__dict__.update(self.builtins)
        return False


def _pm_arg(raw):
    """
    A parameter as the program gets it (`RunRequest.args` are strings, docs/architecture.md 4.6): a
    Python literal (`10`, `0.5`, `'hi'`, `[1, 2]`, `False`), else JSON (`true`, `false`, `null`, a
    mapping written as JSON), else the string itself. The Jupyter environments read parameters back
    with the same rule (addon-exec-jupyter's `argumentsCode`).
    """
    try:
        return ast.literal_eval(raw)
    except (ValueError, SyntaxError, TypeError, MemoryError, RecursionError):
        pass
    try:
        return json.loads(raw)
    except (ValueError, TypeError, RecursionError):
        return raw


def _pm_prepare(code, args_json, stdin, files_json, scope):
    for path, content in json.loads(files_json).items():
        folder = os.path.dirname(path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with open(path, 'w') as f:
            f.write(content)
    sys.stdin = io.StringIO(stdin)
    linecache.cache[_PM_FILE] = (len(code), None, code.splitlines(True), _PM_FILE)
    scope.setdefault('__name__', '__main__')
    scope.setdefault('display', display)
    for name, raw in json.loads(args_json).items():
        scope[name] = _pm_arg(raw)
    return compile(code, _PM_FILE, 'exec')


def _pm_split(code, flags=0):
    """
    The code as Jupyter runs it (docs/ir.md 6.1): its statements, and apart the last one when it is
    an expression, whose value is the run's `execute_result` (`_pm_result`); `(program, None)`
    without one, or when a `;` ends the code, which hides the value as in Jupyter.
    """
    tree = ast.parse(code, _PM_FILE)
    if not tree.body or not isinstance(tree.body[-1], ast.Expr) or code.rstrip().endswith(';'):
        return compile(tree, _PM_FILE, 'exec', flags=flags), None
    last = ast.Expression(tree.body.pop().value)
    return compile(tree, _PM_FILE, 'exec', flags=flags), compile(last, _PM_FILE, 'eval', flags=flags)


def _pm_result(outputs, value):
    """The value of the last expression as an `execute_result`, with the MIME bundle `display` shows; None shows nothing."""
    if value is not None:
        outputs.display({mime: _pm_value(item) for mime, item in _pm_bundle(value).items()}, 'execute_result')


def _pm_user_traceback():
    """The current exception, its traceback starting at the user's code."""
    etype, value, tb = sys.exc_info()
    while tb is not None and tb.tb_frame.f_code.co_filename != _PM_FILE:
        tb = tb.tb_next
    return etype, value, tb


def _pm_session(name, dir=None):
    """A session's state; its working directory is `dir` when given (the run directory), else one of its own."""
    if name not in _PM_SESSIONS:
        own = dir is None
        _PM_SESSIONS[name] = {'scope': {}, 'dir': tempfile.mkdtemp(prefix='presmium-session-') if own else dir, 'own': own}
    return _PM_SESSIONS[name]


def _pm_end(name):
    """Drops a session: its globals and the working directory it made."""
    session = _PM_SESSIONS.pop(name, None)
    if session is not None and session['own']:
        shutil.rmtree(session['dir'], ignore_errors=True)


def _pm_run(code, args_json, stdin, files_json, _max_events, session_name=None, dir=None):
    global _PM_CURRENT
    outputs = _PmOutputs()
    exit_code = 0
    session = _pm_session(session_name, dir) if session_name else None
    scope = session['scope'] if session is not None else {}
    _PM_CURRENT = outputs
    try:
        with _PmIsolation(dir, session), contextlib.redirect_stdout(_PmStream(outputs, 'stdout')), contextlib.redirect_stderr(_PmStream(outputs, 'stderr')):
            try:
                _pm_prepare(code, args_json, stdin, files_json, scope)
                program, last = _pm_split(code)
                exec(program, scope)
                if last is not None:
                    _pm_result(outputs, eval(last, scope))
                _pm_figures()
            except SystemExit as e:
                exit_code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
            except BaseException:
                outputs.error(*_pm_user_traceback())
                exit_code = 1
    finally:
        _PM_CURRENT = None
    return json.dumps({'stdout': ''.join(outputs.text['stdout']), 'stderr': ''.join(outputs.text['stderr']), 'exitCode': exit_code, 'outputs': outputs.items})


def _pm_trace(code, args_json, stdin, files_json, max_events, _session_name=None):
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

    with _PmIsolation(), contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
        try:
            scope = {}
            program = _pm_prepare(code, args_json, stdin, files_json, scope)
            sys.settrace(tracer)
            exec(program, scope)
        except (_PmStop, SystemExit):
            pass
        except BaseException:
            out.write(''.join(traceback.format_exception(*_pm_user_traceback())))
        finally:
            sys.settrace(None)
    if events:
        events[-1]['output'] = out.getvalue()
    return json.dumps({'events': events, 'truncated': truncated, 'output': out.getvalue()})


def _pm_main():
    """
    A compile-time process: runs the requests of `.presmium/request.json` in order in the run
    directory, its working directory (one session when the request names one), and writes the
    result of each as soon as it is known, so a run stopped at its timeout keeps the earlier ones.
    """
    here = os.getcwd()
    channel = os.path.join(here, '.presmium')
    with open(os.path.join(channel, 'request.json'), encoding='utf-8') as f:
        request = json.load(f)
    # E.g. the workspace in a container, whose modules stay importable.
    for path in reversed(request.get('path') or []):
        sys.path.insert(1, path)
    session = request.get('session')
    for i, run in enumerate(request['runs']):
        result = _pm_run(run['code'], json.dumps(run.get('args') or {}), run.get('stdin') or '', json.dumps(run.get('files') or {}), 0, session, here)
        partial = os.path.join(channel, 'result-%d.part' % i)
        with open(partial, 'w', encoding='utf-8') as f:
            f.write(result)
        os.replace(partial, os.path.join(channel, 'result-%d.json' % i))
