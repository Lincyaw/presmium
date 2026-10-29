import errno
import fcntl
import json
import os
import pathlib
import shutil
import struct
import sys
import ctypes
from seccomp_policy import install


slot, capacity, project = sys.argv[1:]
capacity, project = int(capacity), int(project)
if os.geteuid() != 0:
    raise RuntimeError("The real quota probe must start as root and drop to the tenant UID")
root_free = os.statvfs(pathlib.Path(slot).parent.parent)
if root_free.f_bavail * root_free.f_frsize < capacity * 2 or root_free.f_favail < 64:
    raise RuntimeError("The filesystem lacks free space to distinguish quota exhaustion from global ENOSPC")
directory = os.open(slot, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
seccomp_digest, libc, ioctl_syscall = install()
os.setgroups([])
os.setgid(1000)
os.setuid(1000)
os.fchdir(directory)


def attributes(fd):
    data = bytearray(28)
    fcntl.ioctl(fd, 0x801C581F, data, True)
    return list(struct.unpack("=5I8s", data))


def update(fd, values):
    fcntl.ioctl(fd, 0x401C5820, struct.pack("=5I8s", *values))


initial = attributes(directory)
if initial[3] != project or not initial[0] & 0x200:
    raise RuntimeError("Project ID/inheritance was not applied to the slot")
# Exercise each denied family through the raw syscall, including high-bit variants
# that the kernel truncates to unsigned int. GETXATTR above must still succeed.
for command in (0x401C5820, 0x801C5820, 0x40086602, 0x40046602, 0x80086602, 0x80046602):
    for high_bits in (0, 1 << 32, 0xFFFFFFFF00000000):
        buffer = ctypes.create_string_buffer(struct.pack("=5I8s", *initial))
        ctypes.set_errno(0)
        result = libc.syscall(ctypes.c_long(ioctl_syscall), ctypes.c_int(directory), ctypes.c_ulong(command | high_bits), ctypes.byref(buffer))
        if result != -1 or ctypes.get_errno() != errno.EPERM:
            raise RuntimeError("The seccomp policy did not reject a quota-changing raw ioctl")
try:
    os.mkdir(".inheritance-probe", 0o700)
    probe = os.open(".inheritance-probe", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        values = attributes(probe)
        changed = values.copy()
        changed[3] = 0
        try:
            update(probe, changed)
        except OSError as error:
            if error.errno != errno.EPERM:
                raise
        if attributes(probe)[3] != project:
            raise RuntimeError("An unprivileged tenant can escape the project ID")
        changed = values.copy()
        changed[0] &= ~0x200
        try:
            update(probe, changed)
        except OSError as error:
            if error.errno != errno.EPERM:
                raise
        os.mkdir(".inheritance-probe/child", 0o700)
        child = os.open(".inheritance-probe/child", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            if attributes(child)[3] != project:
                raise RuntimeError("An unprivileged tenant can disable project inheritance")
        finally:
            os.close(child)
    finally:
        os.close(probe)
finally:
    shutil.rmtree(".inheritance-probe", ignore_errors=True)

block_error = None
try:
    descriptor = os.open(".block-quota-probe", os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.posix_fallocate(descriptor, 0, 4096)
        try:
            os.posix_fallocate(descriptor, 0, capacity + 4096)
        except OSError as error:
            if error.errno not in (errno.EDQUOT, errno.ENOSPC):
                raise
            block_error = errno.errorcode[error.errno]
        if not block_error:
            raise RuntimeError("A real over-limit fallocate unexpectedly succeeded")
    finally:
        os.close(descriptor)
finally:
    pathlib.Path(".block-quota-probe").unlink(missing_ok=True)

inode_error = None
created = []
try:
    for index in range(16):
        name = f".inode-quota-probe-{index}"
        try:
            descriptor = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except OSError as error:
            if error.errno not in (errno.EDQUOT, errno.ENOSPC):
                raise
            inode_error = errno.errorcode[error.errno]
            break
        os.close(descriptor)
        created.append(name)
    if not inode_error:
        raise RuntimeError("The temporary inode hard limit was not enforced")
finally:
    for name in created:
        pathlib.Path(name).unlink(missing_ok=True)
    os.close(directory)
print(json.dumps({"projectId": project, "blockErrno": block_error, "inodeErrno": inode_error, "projectEscapeBlocked": True, "seccompPolicySha256": seccomp_digest}))
