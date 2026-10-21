import errno
import os
import pty
import select
import sys


answers = sys.stdin.buffer.read()
pid, terminal = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])

os.write(terminal, answers)


def copy_output():
    try:
        output = os.read(terminal, 65536)
    except OSError as error:
        if error.errno != errno.EIO:
            raise
        return False
    sys.stdout.buffer.write(output)
    sys.stdout.buffer.flush()
    return bool(output)


while True:
    if select.select([terminal], [], [], 0.1)[0]:
        copy_output()
    exited, status = os.waitpid(pid, os.WNOHANG)
    if exited:
        while select.select([terminal], [], [], 0)[0] and copy_output():
            pass
        break

os.close(terminal)
code = os.waitstatus_to_exitcode(status)
sys.exit(code if code >= 0 else 128 - code)
