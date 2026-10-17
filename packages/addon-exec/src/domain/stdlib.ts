/**
 * What Python in the browser can import (D-5): Pyodide's standard library
 * only, no third-party package. The top-level modules of CPython's standard
 * library (`sys.stdlib_module_names` of CPython 3.12, with `annotationlib`
 * and `compression` of 3.14, Pyodide's version); a private one (`_thread`)
 * counts too. Besides them the browser has Pyodide's own modules, and those
 * the runner and the WebGPU bridge provide.
 */
const STDLIB = new Set(`abc annotationlib antigravity argparse array ast asyncio atexit base64 bdb binascii bisect builtins bz2
cProfile calendar cmath cmd code codecs codeop collections colorsys compileall compression concurrent configparser
contextlib contextvars copy copyreg csv ctypes curses dataclasses datetime dbm decimal difflib dis doctest email
encodings ensurepip enum errno faulthandler fcntl filecmp fileinput fnmatch fractions ftplib functools gc genericpath
getopt getpass gettext glob graphlib grp gzip hashlib heapq hmac html http idlelib imaplib importlib inspect io
ipaddress itertools json keyword linecache locale logging lzma mailbox marshal math mimetypes mmap modulefinder msvcrt
multiprocessing netrc nt ntpath nturl2path numbers opcode operator optparse os pathlib pdb pickle pickletools pkgutil
platform plistlib poplib posix posixpath pprint profile pstats pty pwd py_compile pyclbr pydoc pydoc_data pyexpat queue
quopri random re readline reprlib resource rlcompleter runpy sched secrets select selectors shelve shlex shutil signal
site smtplib socket socketserver sqlite3 sre_compile sre_constants sre_parse ssl stat statistics string stringprep
struct subprocess symtable sys sysconfig syslog tabnanny tarfile tempfile termios textwrap this threading time timeit
tkinter token tokenize tomllib trace traceback tracemalloc tty turtle turtledemo types typing unicodedata unittest
urllib uuid venv warnings wave weakref webbrowser winreg winsound wsgiref xml xmlrpc zipapp zipfile zipimport zlib
zoneinfo`.split(/\s+/))

/** Pyodide's own modules, and those Presmium gives Python in the browser (`IPython.display` of the runner, the WebGPU bridge). */
const BROWSER = new Set(['pyodide', 'pyodide_js', 'js', 'IPython', 'presmium_gpu'])

/** Whether Python in the browser has the top-level module `name`. */
export function inBrowserPython(name: string): boolean {
  return name.startsWith('_') || STDLIB.has(name) || BROWSER.has(name)
}

/** The top-level modules Python code imports (`import a.b, c as d`, `from e import f`; not relative imports), each once, in order. */
export function pythonImports(code: string): string[] {
  const names: string[] = []
  for (const [, from, list] of code.matchAll(/^[ \t]*(?:from[ \t]+([A-Za-z_][\w.]*)[ \t]+import\b|import[ \t]+([^#;\n]+))/gm)) {
    const modules = from ? [from] : list!.split(',').map(part => part.trim().split(/[ \t]+/)[0]!)
    for (const module of modules) {
      const name = module.split('.')[0]!
      if (/^[A-Za-z_]\w*$/.test(name) && !names.includes(name)) names.push(name)
    }
  }
  return names
}
